import "server-only"

import { ecartCloture, especesAttendues } from "@/lib/caisse-base"
import { mouvementsEspeces } from "@/lib/caisse-tiroir"
import { db } from "@/lib/db"

class Refus extends Error {}

// Meme verrou que l'encaissement : aucune vente ne passe pendant une ouverture ou une cloture.
const verrou = (etabId: string) => "caisse:" + etabId

export async function ouvrirSessionCaisse(o: { etabId: string; email: string; fond: number }): Promise<{ erreur: string } | { ok: true; numero: number }> {
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${verrou(o.etabId)}))::text AS v`
      const deja = await tx.sessionCaisse.findFirst({ where: { etablissementId: o.etabId, caissierEmail: o.email, statut: "OUVERTE" }, select: { numero: true } })
      if (deja) throw new Refus("Vous avez déjà une caisse ouverte (n° " + deja.numero + ").")
      const max = await tx.sessionCaisse.aggregate({ where: { etablissementId: o.etabId }, _max: { numero: true } })
      const numero = (max._max.numero ?? 0) + 1
      await tx.sessionCaisse.create({ data: { etablissementId: o.etabId, numero, caissierEmail: o.email, fondInitial: o.fond } })
      return { ok: true as const, numero }
    })
  } catch (e) {
    if (e instanceof Refus) return { erreur: e.message }
    console.error("Ouverture de caisse en echec", e)
    return { erreur: "Ouverture impossible, réessayez." }
  }
}

export async function cloturerSessionCaisse(o: { etabId: string; sessionId: string; email: string; gestionnaire: boolean; compte: number; note: string }): Promise<{ erreur: string } | { ok: true; numero: number; attendu: number; ecart: number }> {
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${verrou(o.etabId)}))::text AS v`
      const s = await tx.sessionCaisse.findFirst({ where: { id: o.sessionId, etablissementId: o.etabId } })
      if (!s) throw new Refus("Caisse introuvable.")
      if (s.statut !== "OUVERTE") throw new Refus("Cette caisse est déjà clôturée.")
      if (s.caissierEmail !== o.email && !o.gestionnaire) throw new Refus("Seul le caissier ou le gestionnaire peut clôturer cette caisse.")
      const cash = await tx.venteComptoir.aggregate({ where: { sessionId: s.id, statut: "PAYEE", methode: "CASH" }, _sum: { total: true, partCompte: true } })
      const mouvements = await mouvementsEspeces(tx, s)
      const attendu = especesAttendues(s.fondInitial, ((cash._sum.total ?? 0) - (cash._sum.partCompte ?? 0)) + mouvements)
      const ecart = ecartCloture(o.compte, attendu)
      const m = await tx.sessionCaisse.updateMany({
        where: { id: s.id, statut: "OUVERTE" },
        data: { statut: "CLOTUREE", clotureeLe: new Date(), clotureePar: o.email, especesAttendues: attendu, especesComptees: o.compte, ecart, noteCloture: o.note || null },
      })
      if (m.count !== 1) throw new Refus("Cette caisse est déjà clôturée.")
      return { ok: true as const, numero: s.numero, attendu, ecart }
    })
  } catch (e) {
    if (e instanceof Refus) return { erreur: e.message }
    console.error("Cloture de caisse en echec", e)
    return { erreur: "Clôture impossible, réessayez." }
  }
}