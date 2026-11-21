"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { aujourdhui, dateValide, serviceValide, versDate, versIso, type ServiceMenu } from "@/lib/menus"
import { annulerService, servirReservation } from "@/lib/paiements"
import { accesReservationsEcriture } from "@/lib/reservations-acces"

const rafraichir = () => revalidatePath("/reservations", "layout")

// Un creneau est reservable s'il n'est pas passe et que son menu est publie.
async function creneau(etabId: string, dateIso: string, service: string): Promise<{ erreur: string } | { date: Date; service: ServiceMenu }> {
  if (!dateValide(dateIso) || !serviceValide(service)) return { erreur: "Créneau invalide." }
  if (dateIso < aujourdhui()) return { erreur: "Les réservations pour une date passée sont closes." }
  const date = versDate(dateIso)
  const menu = await db.menu.findUnique({ where: { etablissementId_date_service: { etablissementId: etabId, date, service } }, select: { statut: true } })
  if (!menu || menu.statut !== "PUBLISHED") return { erreur: "Aucun menu publié pour ce créneau : réservations fermées." }
  return { date, service }
}

export async function reserverInscrit(dateIso: string, service: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesReservationsEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const matricule = String(fd.get("matricule") ?? "").trim()
  if (!matricule) return { error: "Saisissez un matricule." }
  const c = await creneau(etabId, dateIso, service)
  if ("erreur" in c) return { error: c.erreur }
  const ins = await db.inscrit.findUnique({ where: { etablissementId_matricule: { etablissementId: etabId, matricule } }, select: { id: true, statut: true } })
  if (!ins) return { error: "Matricule inconnu dans cet établissement." }
  if (ins.statut !== "ACTIVE") return { error: "Cet inscrit n'est pas actif." }
  const existante = await db.reservation.findUnique({ where: { inscritId_date_service: { inscritId: ins.id, date: c.date, service: c.service } } })
  if (existante?.statut === "BOOKED") return { error: "Déjà réservé pour ce service." }
  if (existante) {
    await db.reservation.update({ where: { id: existante.id }, data: { statut: "BOOKED", servedAt: null } })
  } else {
    await db.reservation.create({ data: { etablissementId: etabId, inscritId: ins.id, date: c.date, service: c.service } })
  }
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "RESERVATION_CREATED", entity: "Reservation", details: dateIso + " " + c.service + " " + matricule })
  rafraichir()
  return { ok: "Réservation enregistrée." }
}

export async function reserverGroupe(dateIso: string, service: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesReservationsEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const c = await creneau(etabId, dateIso, service)
  if ("erreur" in c) return { error: c.erreur }
  const groupeId = String(fd.get("groupe") ?? "")
  const groupe = await db.referentiel.findFirst({ where: { id: groupeId, etablissementId: etabId, kind: "GROUPE" }, select: { name: true } })
  if (!groupe) return { error: "Choisissez un groupe." }
  const ids = (await db.inscrit.findMany({ where: { etablissementId: etabId, groupeId, statut: "ACTIVE" }, select: { id: true } })).map((i) => i.id)
  if (ids.length === 0) return { error: "Aucun inscrit actif dans ce groupe." }
  const existantes = await db.reservation.findMany({ where: { etablissementId: etabId, date: c.date, service: c.service, inscritId: { in: ids } }, select: { inscritId: true, statut: true } })
  const connus = new Set(existantes.map((r) => r.inscritId))
  const aCreer = ids.filter((id) => !connus.has(id))
  const aReactiver = existantes.filter((r) => r.statut === "CANCELLED").map((r) => r.inscritId)
  const n = aCreer.length + aReactiver.length
  if (n === 0) return { ok: "Aucune nouvelle réservation : tout le groupe est déjà réservé." }
  await db.$transaction([
    db.reservation.createMany({ data: aCreer.map((inscritId) => ({ etablissementId: etabId, inscritId, date: c.date, service: c.service })) }),
    db.reservation.updateMany({ where: { etablissementId: etabId, date: c.date, service: c.service, inscritId: { in: aReactiver } }, data: { statut: "BOOKED", servedAt: null } }),
  ])
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "RESERVATION_GROUP", entity: "Reservation", details: dateIso + " " + c.service + " " + groupe.name + " (" + n + ")" })
  rafraichir()
  return { ok: n + " réservation(s) ajoutée(s)." }
}

async function chargerReservation(id: string, etabId: string) {
  return db.reservation.findFirst({ where: { id, etablissementId: etabId }, include: { inscrit: { select: { matricule: true } } } })
}

export async function annulerReservation(id: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _fd
  const acces = await accesReservationsEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const r = await chargerReservation(id, acces.etabId)
  if (!r || r.statut !== "BOOKED") return { error: "Cette réservation n'existe plus." }
  if (r.servedAt) return { error: "Repas déjà servi : annulez d'abord le pointage." }
  if (versIso(r.date) < aujourdhui()) return { error: "Les réservations passées ne peuvent plus être annulées." }
  await db.reservation.update({ where: { id }, data: { statut: "CANCELLED" } })
  await ecrireAudit({ userId: acces.session.userId, userEmail: acces.session.email, action: "RESERVATION_CANCELLED", entity: "Reservation", entityId: id, details: versIso(r.date) + " " + r.service + " " + r.inscrit.matricule })
  rafraichir()
  return { ok: "Réservation annulée." }
}

export async function pointer(id: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _fd
  const acces = await accesReservationsEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const r = await chargerReservation(id, acces.etabId)
  if (!r || r.statut !== "BOOKED") return { error: "Cette réservation n'existe plus." }
  if (versIso(r.date) !== aujourdhui()) return { error: "Le pointage n'est possible que le jour du service." }
  if (r.servedAt) return { error: "Déjà pointé." }
  const sortie = await servirReservation({ etabId: acces.etabId, userEmail: acces.session.email, reservationId: id })
  if (sortie.deja) return { error: "Déjà pointé." }
  await ecrireAudit({ userId: acces.session.userId, userEmail: acces.session.email, action: "RESERVATION_SERVED", entity: "Reservation", entityId: id, details: versIso(r.date) + " " + r.service + " " + r.inscrit.matricule })
  rafraichir()
  return { ok: "Repas pointé." }
}

export async function depointer(id: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _fd
  const acces = await accesReservationsEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const r = await chargerReservation(id, acces.etabId)
  if (!r || r.statut !== "BOOKED" || !r.servedAt) return { error: "Aucun pointage à annuler." }
  if (versIso(r.date) !== aujourdhui()) return { error: "Le pointage n'est modifiable que le jour du service." }
  const retour = await annulerService({ etabId: acces.etabId, userEmail: acces.session.email, reservationId: id })
  if (!retour.ok) return { error: "Aucun pointage à annuler." }
  await ecrireAudit({ userId: acces.session.userId, userEmail: acces.session.email, action: "RESERVATION_UNSERVED", entity: "Reservation", entityId: id, details: versIso(r.date) + " " + r.service + " " + r.inscrit.matricule })
  rafraichir()
  return { ok: "Pointage annulé." }
}