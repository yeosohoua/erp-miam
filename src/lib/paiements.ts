import "server-only"

import { db } from "@/lib/db"
import { prixApresAides, type TypeAideCle } from "@/lib/aides-base"
import { versIso, type ServiceMenu } from "@/lib/menus"

// Tarif applicable : le debit automatique n'existe que si l'etablissement est en mode prepaye et que le prix est positif.
export async function infoTarif(etabId: string, service: ServiceMenu): Promise<{ actif: boolean; prix: number; devise: string }> {
  const e = await db.etablissement.findUnique({ where: { id: etabId }, select: { prepaye: true, currency: true, tarifs: { where: { service }, select: { prix: true } } } })
  const prix = e?.tarifs[0]?.prix ?? 0
  return { actif: !!e?.prepaye && prix > 0, prix, devise: e?.currency ?? "XOF" }
}

export type SortieService = { deja: boolean; debit: number; solde: number | null; reservationId: string }

// Sert un repas : marque la reservation et debite le compte dans la meme transaction.
// Le marquage conditionnel (servedAt nul) empeche un double debit en cas de passages simultanes.
export async function servirReservation(o: {
  etabId: string
  userEmail: string
  reservationId?: string
  horsReservation?: { inscritId: string; date: Date; service: ServiceMenu }
  servedAt?: Date
}): Promise<SortieService> {
  return db.$transaction(async (tx) => {
    let id = o.reservationId
    if (!id && o.horsReservation) {
      const h = o.horsReservation
      const ex = await tx.reservation.findUnique({ where: { inscritId_date_service: { inscritId: h.inscritId, date: h.date, service: h.service } } })
      if (ex && ex.statut === "BOOKED" && ex.servedAt) return { deja: true, debit: 0, solde: null, reservationId: ex.id }
      if (ex) {
        await tx.reservation.update({ where: { id: ex.id }, data: { statut: "BOOKED", servedAt: null, walkIn: true } })
        id = ex.id
      } else {
        id = (await tx.reservation.create({ data: { etablissementId: o.etabId, inscritId: h.inscritId, date: h.date, service: h.service, walkIn: true } })).id
      }
    }
    if (!id) throw new Error("Réservation introuvable.")
    const r = await tx.reservation.findFirst({ where: { id, etablissementId: o.etabId }, select: { inscritId: true, service: true, date: true } })
    if (!r) throw new Error("Réservation introuvable.")
    const marque = await tx.reservation.updateMany({ where: { id, statut: "BOOKED", servedAt: null }, data: { servedAt: o.servedAt ?? new Date() } })
    if (marque.count === 0) return { deja: true, debit: 0, solde: null, reservationId: id }

    const e = await tx.etablissement.findUnique({ where: { id: o.etabId }, select: { prepaye: true, tarifs: { where: { service: r.service }, select: { prix: true } } } })
    const prix = e?.tarifs[0]?.prix ?? 0
    if (!e?.prepaye || prix <= 0) return { deja: false, debit: 0, solde: null, reservationId: id }
    // Aides sociales : une seule aide s'applique (la plus avantageuse) au prix du repas, a la date du repas.
    const aidesRows = await tx.aideInscrit.findMany({
      where: { etablissementId: o.etabId, inscritId: r.inscritId, debut: { lte: r.date }, OR: [{ fin: null }, { fin: { gte: r.date } }], aide: { active: true } },
      select: { aide: { select: { id: true, nom: true, type: true, valeur: true } } },
    })
    const calcul = prixApresAides(prix, aidesRows.map((x) => ({ id: x.aide.id, nom: x.aide.nom, type: x.aide.type as TypeAideCle, valeur: x.aide.valeur })))
    const net = calcul.prix
    const suffixe = calcul.aide ? " · aide " + calcul.aide.nom + " −" + calcul.reduction : ""
    if (net <= 0) {
      const sans = await tx.inscrit.findUniqueOrThrow({ where: { id: r.inscritId }, select: { solde: true } })
      return { deja: false, debit: 0, solde: sans.solde, reservationId: id }
    }
    const ins = await tx.inscrit.update({ where: { id: r.inscritId }, data: { solde: { decrement: net } }, select: { solde: true } })
    await tx.transaction.create({
      data: { etablissementId: o.etabId, inscritId: r.inscritId, type: "DEBIT", montant: -net, reservationId: id, note: versIso(r.date) + " " + r.service + suffixe, createdBy: o.userEmail },
    })
    return { deja: false, debit: net, solde: ins.solde, reservationId: id }
  })
}

// Annule le pointage et rembourse exactement ce qui avait ete debite pour cette reservation.
export async function annulerService(o: { etabId: string; userEmail: string; reservationId: string }): Promise<{ ok: boolean; rembourse: number }> {
  return db.$transaction(async (tx) => {
    const m = await tx.reservation.updateMany({ where: { id: o.reservationId, etablissementId: o.etabId, statut: "BOOKED", servedAt: { not: null } }, data: { servedAt: null } })
    if (m.count === 0) return { ok: false, rembourse: 0 }
    const r = await tx.reservation.findUniqueOrThrow({ where: { id: o.reservationId }, select: { inscritId: true, date: true, service: true } })
    const agg = await tx.transaction.aggregate({ where: { etablissementId: o.etabId, reservationId: o.reservationId, type: { in: ["DEBIT", "REFUND"] } }, _sum: { montant: true } })
    const net = agg._sum.montant ?? 0
    if (net >= 0) return { ok: true, rembourse: 0 }
    await tx.inscrit.update({ where: { id: r.inscritId }, data: { solde: { increment: -net } } })
    await tx.transaction.create({
      data: { etablissementId: o.etabId, inscritId: r.inscritId, type: "REFUND", montant: -net, reservationId: o.reservationId, note: "Pointage annulé " + versIso(r.date) + " " + r.service, createdBy: o.userEmail },
    })
    return { ok: true, rembourse: -net }
  })
}