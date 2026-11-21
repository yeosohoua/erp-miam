"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { accesAchatsEcriture, accesReception } from "@/lib/approvisionnement-acces"
import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { emailValide } from "@/lib/facturation-base"
import { aujourdhui, dateValide, parseNombre, versDate } from "@/lib/menus"
import { ErreurStock, entrerStock } from "@/lib/stock"
import { numeroBon, parseQuantite, q3 } from "@/lib/stock-base"

const rafraichir = () => {
  revalidatePath("/achats", "layout")
  revalidatePath("/stock", "layout")
  revalidatePath("/", "layout")
}
const nettoyer = (v: FormDataEntryValue | null): string => String(v ?? "").trim()
const estDoublon = (e: unknown): boolean => e instanceof Error && (("code" in e && (e as { code?: string }).code === "P2002") || /unique/i.test(e.message))
const chargerBon = (id: string, etabId: string) => db.bonCommande.findFirst({ where: { id, etablissementId: etabId }, include: { lignes: true } })

export async function creerFournisseur(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesAchatsEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const name = nettoyer(fd.get("name"))
  const email = nettoyer(fd.get("email"))
  const phone = nettoyer(fd.get("phone"))
  const address = nettoyer(fd.get("address"))
  if (name.length < 2 || name.length > 80) return { error: "Le nom du fournisseur doit comporter 2 à 80 caractères." }
  if (email && !emailValide(email)) return { error: "Adresse e-mail invalide." }
  if (phone.length > 30) return { error: "Téléphone trop long (30 caractères maximum)." }
  if (address.length > 200) return { error: "Adresse trop longue (200 caractères maximum)." }
  try {
    const f = await db.fournisseur.create({ data: { etablissementId: etabId, name, email: email || null, phone: phone || null, address: address || null } })
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "FOURNISSEUR_CREE", entity: "Fournisseur", entityId: f.id, details: name })
    rafraichir()
    return { ok: "Fournisseur créé." }
  } catch (e) {
    if (estDoublon(e)) return { error: "Un fournisseur porte déjà ce nom." }
    console.error("Creation du fournisseur en echec", e)
    return { error: "Création impossible, réessayez." }
  }
}

export async function supprimerFournisseur(id: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _etat
  void _fd
  const acces = await accesAchatsEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const f = await db.fournisseur.findFirst({ where: { id, etablissementId: etabId }, select: { id: true, name: true, _count: { select: { bons: true } } } })
  if (!f) return { error: "Fournisseur introuvable." }
  if (f._count.bons > 0) return { error: "Ce fournisseur a des bons de commande : suppression impossible." }
  await db.fournisseur.delete({ where: { id: f.id } })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "FOURNISSEUR_SUPPRIME", entity: "Fournisseur", entityId: f.id, details: f.name })
  rafraichir()
  return { ok: "Fournisseur supprimé." }
}

export async function creerBon(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesAchatsEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const fournisseurId = nettoyer(fd.get("fournisseurId"))
  const note = nettoyer(fd.get("note"))
  if (!fournisseurId) return { error: "Choisissez un fournisseur." }
  if (note.length > 200) return { error: "Note trop longue (200 caractères maximum)." }
  const f = await db.fournisseur.findFirst({ where: { id: fournisseurId, etablissementId: etabId }, select: { id: true, name: true } })
  if (!f) return { error: "Fournisseur introuvable." }
  let id = ""
  try {
    const b = await db.bonCommande.create({ data: { etablissementId: etabId, fournisseurId: f.id, note: note || null } })
    id = b.id
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "BON_CREE", entity: "BonCommande", entityId: b.id, details: f.name })
  } catch (e) {
    console.error("Creation du bon en echec", e)
    return { error: "Création impossible, réessayez." }
  }
  rafraichir()
  redirect("/achats/" + id)
}

export async function ajouterLigneBon(bonId: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesAchatsEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { etabId } = acces
  const bon = await chargerBon(bonId, etabId)
  if (!bon) return { error: "Bon introuvable." }
  if (bon.statut !== "DRAFT") return { error: "Le bon n'est plus modifiable." }
  const ingredientId = nettoyer(fd.get("ingredientId"))
  const quantite = parseQuantite(nettoyer(fd.get("quantite")))
  const prix = parseNombre(nettoyer(fd.get("prix")))
  if (!ingredientId) return { error: "Choisissez un ingrédient." }
  if (quantite === null) return { error: "Quantité invalide : un nombre supérieur à zéro." }
  if (prix === null) return { error: "Prix invalide : un nombre positif ou nul." }
  const ing = await db.ingredient.findFirst({ where: { id: ingredientId, etablissementId: etabId }, select: { id: true } })
  if (!ing) return { error: "Ingrédient introuvable." }
  if (bon.lignes.some((l) => l.ingredientId === ing.id)) return { error: "Cet ingrédient figure déjà dans le bon." }
  try {
    await db.bonCommandeLigne.create({ data: { bonId: bon.id, ingredientId: ing.id, quantite, prix } })
  } catch (e) {
    if (estDoublon(e)) return { error: "Cet ingrédient figure déjà dans le bon." }
    console.error("Ajout de ligne en echec", e)
    return { error: "Ajout impossible, réessayez." }
  }
  rafraichir()
  return { ok: "Ligne ajoutée." }
}

export async function retirerLigneBon(ligneId: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _etat
  void _fd
  const acces = await accesAchatsEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const ligne = await db.bonCommandeLigne.findFirst({ where: { id: ligneId, bon: { etablissementId: acces.etabId } }, include: { bon: { select: { statut: true } } } })
  if (!ligne) return { error: "Ligne introuvable." }
  if (ligne.bon.statut !== "DRAFT") return { error: "Le bon n'est plus modifiable." }
  await db.bonCommandeLigne.delete({ where: { id: ligne.id } })
  rafraichir()
  return { ok: "Ligne retirée." }
}

export async function envoyerBon(bonId: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _etat
  void _fd
  const acces = await accesAchatsEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const bon = await chargerBon(bonId, etabId)
  if (!bon) return { error: "Bon introuvable." }
  if (bon.statut !== "DRAFT") return { error: "Ce bon a déjà été envoyé." }
  if (bon.lignes.length === 0) return { error: "Ajoutez au moins une ligne avant d'envoyer le bon." }
  for (let essai = 0; essai < 5; essai++) {
    const max = await db.bonCommande.aggregate({ where: { etablissementId: etabId }, _max: { numero: true } })
    const numero = (max._max.numero ?? 0) + 1
    try {
      await db.bonCommande.update({ where: { id: bon.id }, data: { numero, statut: "SENT", envoyeLe: new Date() } })
      await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "BON_ENVOYE", entity: "BonCommande", entityId: bon.id, details: numeroBon(numero) })
      rafraichir()
      return { ok: "Bon envoyé : " + numeroBon(numero) + "." }
    } catch (e) {
      if (!estDoublon(e)) {
        console.error("Envoi du bon en echec", e)
        return { error: "Envoi impossible, réessayez." }
      }
    }
  }
  return { error: "Numérotation indisponible, réessayez." }
}

export async function supprimerBon(bonId: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _etat
  void _fd
  const acces = await accesAchatsEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const bon = await chargerBon(bonId, acces.etabId)
  if (!bon) return { error: "Bon introuvable." }
  if (bon.statut !== "DRAFT") return { error: "Seul un brouillon peut être supprimé." }
  await db.bonCommande.delete({ where: { id: bon.id } })
  rafraichir()
  redirect("/achats")
}

export async function annulerBon(bonId: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _etat
  void _fd
  const acces = await accesAchatsEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const bon = await chargerBon(bonId, etabId)
  if (!bon) return { error: "Bon introuvable." }
  if (bon.statut !== "SENT" || bon.lignes.some((l) => Number(l.recue) > 0)) return { error: "Seul un bon envoyé sans aucune réception peut être annulé." }
  await db.bonCommande.update({ where: { id: bon.id }, data: { statut: "CANCELLED" } })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "BON_ANNULE", entity: "BonCommande", entityId: bon.id, details: numeroBon(bon.numero) })
  rafraichir()
  return { ok: "Bon annulé." }
}

export async function recevoirLigne(ligneId: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesReception()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const quantite = parseQuantite(nettoyer(fd.get("quantite")))
  const peremptionBrute = nettoyer(fd.get("peremption"))
  const referenceBrute = nettoyer(fd.get("reference"))
  if (quantite === null) return { error: "Quantité invalide : un nombre supérieur à zéro." }
  if (peremptionBrute && !dateValide(peremptionBrute)) return { error: "Date de péremption invalide." }
  if (peremptionBrute && peremptionBrute < aujourdhui()) return { error: "La date de péremption est dépassée : produit refusé." }
  if (referenceBrute.length > 40) return { error: "Référence de lot trop longue (40 caractères maximum)." }
  try {
    const nom = await db.$transaction(async (tx) => {
      const ligne = await tx.bonCommandeLigne.findFirst({ where: { id: ligneId, bon: { etablissementId: etabId } }, include: { bon: true, ingredient: { select: { name: true } } } })
      if (!ligne) throw new ErreurStock("Ligne introuvable.")
      if (ligne.bon.statut !== "SENT" && ligne.bon.statut !== "PARTIAL") throw new ErreurStock("Ce bon n'accepte plus de réception.")
      const reste = q3(Number(ligne.quantite) - Number(ligne.recue))
      if (quantite > reste) throw new ErreurStock("La quantité reçue dépasse le reste à recevoir.")
      const prix = Number(ligne.prix)
      await tx.bonCommandeLigne.update({ where: { id: ligne.id }, data: { recue: { increment: quantite } } })
      await entrerStock(tx, {
        etabId,
        ingredientId: ligne.ingredientId,
        quantite,
        prix,
        peremption: peremptionBrute ? versDate(peremptionBrute) : null,
        reference: referenceBrute || numeroBon(ligne.bon.numero),
        bonId: ligne.bonId,
        type: "ENTREE",
        note: null,
        userEmail: session.email,
      })
      if (prix > 0) await tx.ingredient.update({ where: { id: ligne.ingredientId }, data: { unitCost: prix } })
      const lignes = await tx.bonCommandeLigne.findMany({ where: { bonId: ligne.bonId } })
      const complet = lignes.every((l) => q3(Number(l.recue)) >= q3(Number(l.quantite)))
      await tx.bonCommande.update({ where: { id: ligne.bonId }, data: { statut: complet ? "RECEIVED" : "PARTIAL" } })
      return ligne.ingredient.name
    })
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "BON_RECEPTION", entity: "BonCommandeLigne", entityId: ligneId, details: nom + " : " + quantite })
    rafraichir()
    return { ok: "Réception enregistrée." }
  } catch (e) {
    if (e instanceof ErreurStock) return { error: e.message }
    console.error("Reception en echec", e)
    return { error: "Réception impossible, réessayez." }
  }
}