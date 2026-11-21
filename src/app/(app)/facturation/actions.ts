"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { genererFactures } from "@/lib/facturation"
import { notifierRelance } from "@/lib/notifications"
import { accesFacturationEcriture } from "@/lib/facturation-acces"
import { DELAI_MAX, RELANCE_MAX, emailValide, numeroAffiche, periodeValide, restant } from "@/lib/facturation-base"
import { ajouterJours, aujourdhui, formaterMontant, versDate, versIso } from "@/lib/menus"
import { MONTANT_MAX, methodeValide, parseMontant } from "@/lib/paiements-base"

const rafraichir = () => {
  revalidatePath("/facturation", "layout")
  revalidatePath("/", "layout")
}
const nettoyer = (v: FormDataEntryValue | null): string => String(v ?? "").trim()
const estDoublon = (e: unknown): boolean => e instanceof Error && (("code" in e && (e as { code?: string }).code === "P2002") || /unique/i.test(e.message))
const devise = async (etabId: string): Promise<string> => (await db.etablissement.findUnique({ where: { id: etabId }, select: { currency: true } }))?.currency ?? "XOF"

export async function creerClient(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesFacturationEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const name = nettoyer(fd.get("name"))
  const email = nettoyer(fd.get("email"))
  const phone = nettoyer(fd.get("phone"))
  const address = nettoyer(fd.get("address"))
  if (name.length < 2 || name.length > 80) return { error: "Le nom du client doit comporter 2 à 80 caractères." }
  if (email && !emailValide(email)) return { error: "Adresse e-mail invalide." }
  if (phone.length > 30) return { error: "Téléphone trop long (30 caractères maximum)." }
  if (address.length > 200) return { error: "Adresse trop longue (200 caractères maximum)." }
  try {
    const c = await db.client.create({ data: { etablissementId: etabId, name, email: email || null, phone: phone || null, address: address || null } })
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "CLIENT_CREE", entity: "Client", entityId: c.id, details: name })
    rafraichir()
    return { ok: "Client créé." }
  } catch (e) {
    if (estDoublon(e)) return { error: "Un client porte déjà ce nom." }
    console.error("Creation du client en echec", e)
    return { error: "Création impossible, réessayez." }
  }
}

// clientId vide = detacher l'inscrit de son client.
export async function rattacher(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesFacturationEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const matricule = nettoyer(fd.get("matricule"))
  const clientId = nettoyer(fd.get("clientId"))
  if (!matricule) return { error: "Saisissez un matricule." }
  const ins = await db.inscrit.findUnique({ where: { etablissementId_matricule: { etablissementId: etabId, matricule } }, select: { id: true } })
  if (!ins) return { error: "Matricule inconnu dans cet établissement." }
  let nom = "aucun client"
  if (clientId) {
    const c = await db.client.findFirst({ where: { id: clientId, etablissementId: etabId }, select: { name: true } })
    if (!c) return { error: "Client introuvable." }
    nom = c.name
  }
  await db.inscrit.update({ where: { id: ins.id }, data: { clientId: clientId || null } })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "CLIENT_RATTACHE", entity: "Inscrit", entityId: ins.id, details: matricule + " -> " + nom })
  rafraichir()
  return { ok: clientId ? "Inscrit rattaché." : "Inscrit détaché." }
}

export async function supprimerClient(clientId: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _etat
  void _fd
  const acces = await accesFacturationEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const c = await db.client.findFirst({ where: { id: clientId, etablissementId: etabId }, select: { id: true, name: true, _count: { select: { inscrits: true, factures: true } } } })
  if (!c) return { error: "Client introuvable." }
  if (c._count.inscrits > 0) return { error: "Détachez d'abord les inscrits rattachés." }
  if (c._count.factures > 0) return { error: "Ce client a des factures : il ne peut pas être supprimé." }
  await db.client.delete({ where: { id: c.id } })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "CLIENT_SUPPRIME", entity: "Client", entityId: c.id, details: c.name })
  rafraichir()
  return { ok: "Client supprimé." }
}

export async function generer(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesFacturationEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const periode = nettoyer(fd.get("periode"))
  if (!periodeValide(periode)) return { error: "Mois invalide." }
  if (periode > aujourdhui().slice(0, 7)) return { error: "Cette période n'est pas encore commencée." }
  const r = await genererFactures({ etabId, periode, userEmail: session.email })
  if ("erreur" in r) return { error: r.erreur }
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "FACTURES_GENEREES", entity: "Etablissement", entityId: etabId, details: periode + " : " + r.factures + " facture(s), " + r.repas + " repas, " + r.total })
  rafraichir()
  return { ok: r.factures + " facture(s) brouillon créée(s) pour " + r.repas + " repas. Vérifiez-les puis émettez-les." }
}

export async function emettre(factureId: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesFacturationEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const brut = nettoyer(fd.get("delai")) || "30"
  const delai = /^\d{1,3}$/.test(brut) ? Number(brut) : -1
  if (delai < 0 || delai > DELAI_MAX) return { error: "Délai invalide : 0 à " + DELAI_MAX + " jours." }
  const f = await db.facture.findFirst({ where: { id: factureId, etablissementId: etabId }, select: { statut: true, total: true, client: { select: { name: true } } } })
  if (!f) return { error: "Facture introuvable." }
  if (f.statut !== "DRAFT") return { error: "Seul un brouillon peut être émis." }
  if (f.total <= 0) return { error: "Une facture à zéro ne peut pas être émise." }
  const echeance = versDate(ajouterJours(aujourdhui(), delai))
  for (let essai = 0; essai < 3; essai++) {
    try {
      const numero = await db.$transaction(async (tx) => {
        const max = await tx.facture.aggregate({ where: { etablissementId: etabId }, _max: { numero: true } })
        const n = (max._max.numero ?? 0) + 1
        const m = await tx.facture.updateMany({ where: { id: factureId, etablissementId: etabId, statut: "DRAFT" }, data: { statut: "ISSUED", numero: n, emisLe: new Date(), echeance } })
        return m.count === 1 ? n : null
      })
      if (numero === null) return { error: "Cette facture n'est plus un brouillon." }
      await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "FACTURE_EMISE", entity: "Facture", entityId: factureId, details: numeroAffiche(numero) + " " + f.client.name + " " + f.total + " échéance " + versIso(echeance) })
      rafraichir()
      return { ok: "Facture " + numeroAffiche(numero) + " émise." }
    } catch (e) {
      if (!estDoublon(e)) {
        console.error("Emission en echec", e)
        return { error: "Émission impossible, réessayez." }
      }
    }
  }
  return { error: "Numérotation occupée, réessayez." }
}

export async function supprimerBrouillon(factureId: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _etat
  void _fd
  const acces = await accesFacturationEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const f = await db.facture.findFirst({ where: { id: factureId, etablissementId: etabId, statut: "DRAFT" }, select: { id: true, total: true, client: { select: { name: true } } } })
  if (!f) return { error: "Brouillon introuvable." }
  await db.$transaction([db.reservation.updateMany({ where: { factureId: f.id }, data: { factureId: null } }), db.facture.delete({ where: { id: f.id } })])
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "FACTURE_SUPPRIMEE", entity: "Facture", entityId: f.id, details: "Brouillon " + f.client.name + " " + f.total })
  rafraichir()
  return { ok: "Brouillon supprimé : les repas peuvent être refacturés." }
}

// Une facture deja encaissee, meme en partie, ne peut pas etre annulee.
export async function annulerFacture(factureId: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _etat
  void _fd
  const acces = await accesFacturationEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const f = await db.facture.findFirst({ where: { id: factureId, etablissementId: etabId }, select: { id: true, numero: true, statut: true, total: true, client: { select: { name: true } } } })
  if (!f) return { error: "Facture introuvable." }
  if (f.statut !== "ISSUED") return { error: "Seule une facture émise et non réglée peut être annulée." }
  const fait = await db.$transaction(async (tx) => {
    if ((await tx.reglement.count({ where: { factureId: f.id } })) > 0) return false
    const m = await tx.facture.updateMany({ where: { id: f.id, statut: "ISSUED" }, data: { statut: "CANCELLED" } })
    if (m.count !== 1) return false
    await tx.reservation.updateMany({ where: { factureId: f.id }, data: { factureId: null } })
    return true
  })
  if (!fait) return { error: "Cette facture a déjà reçu un règlement : elle ne peut pas être annulée." }
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "FACTURE_ANNULEE", entity: "Facture", entityId: f.id, details: numeroAffiche(f.numero) + " " + f.client.name + " " + f.total })
  rafraichir()
  return { ok: "Facture annulée : les repas peuvent être refacturés." }
}

export async function encaisser(factureId: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesFacturationEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const montant = parseMontant(nettoyer(fd.get("montant")))
  const methode = nettoyer(fd.get("methode"))
  const reference = nettoyer(fd.get("reference"))
  if (montant === null || montant < 1) return { error: "Montant invalide : un entier entre 1 et " + MONTANT_MAX.toLocaleString("fr-FR") + "." }
  if (!methodeValide(methode)) return { error: "Choisissez un mode de paiement." }
  if (reference.length > 60) return { error: "Référence trop longue (60 caractères maximum)." }
  if (methode !== "CASH" && reference.length < 4) return { error: "La référence de la transaction Mobile Money est obligatoire (4 caractères minimum)." }
  const f = await db.facture.findFirst({ where: { id: factureId, etablissementId: etabId }, select: { statut: true, total: true, numero: true, reglements: { select: { montant: true } } } })
  if (!f) return { error: "Facture introuvable." }
  if (f.statut !== "ISSUED") return { error: "Seule une facture émise peut être réglée." }
  const reste = restant(f.total, f.reglements)
  if (montant > reste) return { error: "Montant supérieur au restant dû." }
  if (reference && (await db.reglement.findFirst({ where: { etablissementId: etabId, reference }, select: { id: true } }))) return { error: "Cette référence de transaction a déjà été enregistrée." }
  try {
    const solde = await db.$transaction(async (tx) => {
      const cur = await tx.facture.findFirst({ where: { id: factureId, etablissementId: etabId, statut: "ISSUED" }, select: { total: true } })
      if (!cur) throw new Error("STATUT")
      await tx.reglement.create({ data: { etablissementId: etabId, factureId, montant, methode, reference: reference || null, createdBy: session.email } })
      const somme = (await tx.reglement.aggregate({ where: { factureId }, _sum: { montant: true } }))._sum.montant ?? 0
      if (somme > cur.total) throw new Error("SURPLUS")
      if (somme === cur.total) await tx.facture.update({ where: { id: factureId }, data: { statut: "PAID" } })
      return cur.total - somme
    })
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "REGLEMENT_FACTURE", entity: "Facture", entityId: factureId, details: numeroAffiche(f.numero) + " +" + montant + " " + methode + (reference ? " " + reference : "") })
    rafraichir()
    return { ok: solde === 0 ? "Règlement enregistré : facture soldée." : "Règlement enregistré. Reste dû : " + formaterMontant(solde, await devise(etabId)) + "." }
  } catch (e) {
    if (e instanceof Error && e.message === "SURPLUS") return { error: "Montant supérieur au restant dû." }
    if (e instanceof Error && e.message === "STATUT") return { error: "Seule une facture émise peut être réglée." }
    if (estDoublon(e)) return { error: "Cette référence de transaction a déjà été enregistrée." }
    console.error("Reglement en echec", e)
    return { error: "Règlement impossible, réessayez." }
  }
}

// Enregistre la relance ; l'envoi par SMS ou e-mail viendra avec le module Notifications.
export async function relancer(factureId: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesFacturationEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const note = nettoyer(fd.get("note"))
  if (note.length > 200) return { error: "Note trop longue (200 caractères maximum)." }
  const f = await db.facture.findFirst({ where: { id: factureId, etablissementId: etabId }, select: { statut: true, total: true, numero: true, echeance: true, reglements: { select: { montant: true } }, relances: { select: { niveau: true } } } })
  if (!f) return { error: "Facture introuvable." }
  if (f.statut !== "ISSUED" || restant(f.total, f.reglements) <= 0) return { error: "Aucune relance à faire sur cette facture." }
  if (!f.echeance || versIso(f.echeance) >= aujourdhui()) return { error: "La facture n'est pas encore en retard." }
  const niveau = f.relances.length + 1
  if (niveau > RELANCE_MAX) return { error: RELANCE_MAX + " relances ont déjà été enregistrées : passez au recouvrement." }
  try {
    await db.relance.create({ data: { factureId, niveau, note: note || null, createdBy: session.email } })
  } catch (e) {
    if (estDoublon(e)) return { error: "Relance déjà enregistrée, actualisez la page." }
    console.error("Relance en echec", e)
    return { error: "Relance impossible, réessayez." }
  }
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "RELANCE_FACTURE", entity: "Facture", entityId: factureId, details: numeroAffiche(f.numero) + " niveau " + niveau })
  rafraichir()
  const envoi = await notifierRelance(factureId, niveau)
  return { ok: "Relance n°" + niveau + " enregistrée" + (envoi.crees > 0 ? " — " + envoi.envoyes + " message(s) envoyé(s) sur " + envoi.crees + "." : ".") }
}