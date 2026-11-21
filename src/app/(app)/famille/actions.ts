"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import type { EtatRecharge } from "@/lib/etat-recharge"
import { valeurConfig } from "@/lib/config"
import { enfantDe, accesFamille } from "@/lib/famille"
import { auteurParent } from "@/lib/satisfaction-base"
import { ajouterJours, aujourdhui, dateValide, formaterMontant, serviceValide, versDate } from "@/lib/menus"
import { parseMontant } from "@/lib/paiements-base"
import { MESSAGES_ISSUE, RECHARGE_MAX, RECHARGE_MIN, crediterPaiement, initialiserPaiement, nouvelleReference, paystackConfigure } from "@/lib/paystack"

const rafraichir = () => revalidatePath("/famille", "layout")

async function contexte(inscritId: string) {
  const session = await accesFamille()
  if (!session) return { erreur: "Action réservée aux parents." } as const
  const enfant = await enfantDe(session.email, inscritId)
  if (!enfant) return { erreur: "Enfant introuvable." } as const
  return { session, enfant } as const
}

async function urlBase(): Promise<string> {
  const configuree = (await valeurConfig("APP_URL")).replace(/\/+$/, "")
  if (configuree) return configuree
  const h = await headers()
  return (h.get("x-forwarded-proto") ?? "http") + "://" + (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000")
}

export async function reserverEnfant(inscritId: string, dateIso: string, service: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _etat
  void _fd
  const c = await contexte(inscritId)
  if ("erreur" in c) return { error: c.erreur }
  const { session, enfant } = c
  if (enfant.statut !== "ACTIVE") return { error: "Le compte de cet enfant n'est pas actif." }
  if (!dateValide(dateIso) || !serviceValide(service)) return { error: "Créneau invalide." }
  const jour = aujourdhui()
  if (dateIso < jour || dateIso > ajouterJours(jour, 13)) return { error: "Réservation possible d'aujourd'hui à 14 jours." }
  const date = versDate(dateIso)
  const menu = await db.menu.findUnique({ where: { etablissementId_date_service: { etablissementId: enfant.etablissementId, date, service } }, select: { statut: true } })
  if (!menu || menu.statut !== "PUBLISHED") return { error: "Aucun menu publié pour ce créneau." }
  const ex = await db.reservation.findUnique({ where: { inscritId_date_service: { inscritId: enfant.id, date, service } } })
  if (ex?.statut === "BOOKED") return { error: "Déjà réservé." }
  if (ex) await db.reservation.update({ where: { id: ex.id }, data: { statut: "BOOKED", servedAt: null } })
  else await db.reservation.create({ data: { etablissementId: enfant.etablissementId, inscritId: enfant.id, date, service } })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "RESERVATION_CREATED", entity: "Reservation", details: dateIso + " " + service + " " + enfant.matricule + " (parent)" })
  rafraichir()
  return { ok: "Repas réservé." }
}

export async function annulerEnfant(inscritId: string, dateIso: string, service: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _etat
  void _fd
  const c = await contexte(inscritId)
  if ("erreur" in c) return { error: c.erreur }
  const { session, enfant } = c
  if (!dateValide(dateIso) || !serviceValide(service)) return { error: "Créneau invalide." }
  if (dateIso < aujourdhui()) return { error: "Les réservations passées ne peuvent plus être annulées." }
  const ex = await db.reservation.findUnique({ where: { inscritId_date_service: { inscritId: enfant.id, date: versDate(dateIso), service } } })
  if (!ex || ex.statut !== "BOOKED") return { error: "Aucune réservation à annuler." }
  if (ex.servedAt) return { error: "Repas déjà servi." }
  await db.reservation.update({ where: { id: ex.id }, data: { statut: "CANCELLED" } })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "RESERVATION_CANCELLED", entity: "Reservation", entityId: ex.id, details: dateIso + " " + service + " " + enfant.matricule + " (parent)" })
  rafraichir()
  return { ok: "Réservation annulée." }
}

// Cree la demande de paiement puis renvoie l'adresse du paiement Paystack ; le credit n'a lieu qu'apres verification.
export async function lancerRecharge(inscritId: string, _etat: EtatRecharge, fd: FormData): Promise<EtatRecharge> {
  void _etat
  const c = await contexte(inscritId)
  if ("erreur" in c) return { error: c.erreur }
  const { session, enfant } = c
  if (!(await paystackConfigure())) return { error: "Le paiement en ligne n'est pas encore activé. Rechargez auprès du caissier." }
  if (!enfant.etablissement.prepaye) return { error: "Le compte prépayé n'est pas activé dans cet établissement." }
  if (enfant.statut !== "ACTIVE") return { error: "Le compte de cet enfant n'est pas actif." }
  const montant = parseMontant(String(fd.get("montant") ?? ""))
  if (montant === null || montant < RECHARGE_MIN || montant > RECHARGE_MAX) {
    return { error: "Montant invalide : entre " + formaterMontant(RECHARGE_MIN, enfant.etablissement.currency) + " et " + formaterMontant(RECHARGE_MAX, enfant.etablissement.currency) + "." }
  }
  const reference = nouvelleReference()
  await db.paiementEnLigne.create({ data: { etablissementId: enfant.etablissementId, inscritId: enfant.id, userId: session.userId, userEmail: session.email, reference, montant } })
  const r = await initialiserPaiement({ email: session.email, montant, reference, callbackUrl: (await urlBase()) + "/famille/retour", metadata: { inscritId: enfant.id, matricule: enfant.matricule } })
  if ("erreur" in r) {
    await db.paiementEnLigne.update({ where: { reference }, data: { statut: "FAILED" } })
    return { error: r.erreur }
  }
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "PAIEMENT_PAYSTACK_INIT", entity: "Inscrit", entityId: enfant.id, details: enfant.matricule + " " + montant + " " + reference })
  return { ok: "Redirection vers Paystack...", url: r.url }
}

// Reverification manuelle d'un paiement reste en attente (retour navigateur perdu, webhook non recu).
export async function verifierRecharge(reference: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _etat
  void _fd
  const session = await accesFamille()
  if (!session) return { error: "Action réservée aux parents." }
  const p = await db.paiementEnLigne.findFirst({ where: { reference, userId: session.userId }, select: { id: true } })
  if (!p) return { error: "Paiement introuvable." }
  const issue = await crediterPaiement(reference)
  rafraichir()
  return issue === "CREDITE" || issue === "DEJA" ? { ok: MESSAGES_ISSUE[issue] } : { error: MESSAGES_ISSUE[issue] }
}

export async function donnerAvis(inscritId: string, dateIso: string, service: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  void _etat
  const c = await contexte(inscritId)
  if ("erreur" in c) return { error: c.erreur }
  const { session, enfant } = c
  if (!dateValide(dateIso) || !serviceValide(service)) return { error: "Repas invalide." }
  const jour = aujourdhui()
  if (dateIso > jour || dateIso < ajouterJours(jour, -14)) return { error: "Vous pouvez donner votre avis sur les repas des 14 derniers jours." }
  const date = versDate(dateIso)
  const servi = await db.reservation.findFirst({ where: { inscritId: enfant.id, date, service, statut: "BOOKED", servedAt: { not: null } }, select: { id: true } })
  if (!servi) return { error: "Seuls les repas servis à votre enfant peuvent être notés." }
  const auteur = auteurParent(enfant.firstName, enfant.lastName)
  const doublon = await db.avis.findFirst({ where: { etablissementId: enfant.etablissementId, date, service, source: "PARENT", auteur }, select: { id: true } })
  if (doublon) return { error: "Un avis a déjà été donné pour ce repas." }
  const noteBrut = String(fd.get("note") ?? "").trim()
  const note = /^[1-5]$/.test(noteBrut) ? Number(noteBrut) : 0
  if (note === 0) return { error: "Note invalide : de 1 à 5." }
  const commentaire = String(fd.get("commentaire") ?? "").trim()
  if (commentaire.length > 500) return { error: "Commentaire trop long (500 caractères maximum)." }
  const platId = String(fd.get("platId") ?? "").trim()
  let plat: { id: string; name: string } | null = null
  if (platId) {
    const menu = await db.menu.findUnique({ where: { etablissementId_date_service: { etablissementId: enfant.etablissementId, date, service } }, include: { plats: { include: { plat: { select: { id: true, name: true } } } } } })
    plat = menu?.plats.find((mp) => mp.plat.id === platId)?.plat ?? null
    if (!plat) return { error: "Ce plat ne figurait pas au menu de ce repas." }
  }
  const a = await db.avis.create({ data: { etablissementId: enfant.etablissementId, date, service, platId: plat?.id ?? null, platNom: plat?.name ?? null, note, commentaire: commentaire || null, source: "PARENT", auteur } })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "AVIS_PARENT", entity: "Avis", entityId: a.id, details: dateIso + " " + service + " " + enfant.matricule + " " + note + "/5 (parent)" })
  rafraichir()
  revalidatePath("/satisfaction", "layout")
  return { ok: "Merci pour votre avis." }
}