"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { accesReapproEcriture } from "@/lib/reappro-acces"
import { genererBonsReappro } from "@/lib/reappro"
import type { SessionData } from "@/lib/session-token"

const rafraichir = () => {
  revalidatePath("/reappro", "layout")
  revalidatePath("/achats", "layout")
}
const nettoyer = (v: FormDataEntryValue | null): string => String(v ?? "").trim()

async function audit(session: SessionData, action: string, entityId: string, details: string): Promise<void> {
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action, entity: "Reappro", entityId, details })
}

export async function enregistrerRegle(_p: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesReapproEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const ingredientId = nettoyer(fd.get("ingredientId"))
  const cibleBrut = nettoyer(fd.get("cible")).replace(",", ".")
  const fournisseurId = nettoyer(fd.get("fournisseurId"))
  const delaiBrut = nettoyer(fd.get("delaiJours"))
  if (!ingredientId) return { error: "Choisissez un ingrédient." }
  if (!/^\d{1,7}(\.\d{1,3})?$/.test(cibleBrut) || Number(cibleBrut) <= 0) return { error: "Cible invalide : un nombre supérieur à zéro." }
  if (!/^\d{1,2}$/.test(delaiBrut) || Number(delaiBrut) > 60) return { error: "Délai invalide : de 0 à 60 jours." }
  const ing = await db.ingredient.findFirst({ where: { id: ingredientId, etablissementId: etabId }, select: { id: true, name: true } })
  if (!ing) return { error: "Ingrédient introuvable." }
  if (fournisseurId) {
    const f = await db.fournisseur.findFirst({ where: { id: fournisseurId, etablissementId: etabId }, select: { id: true } })
    if (!f) return { error: "Fournisseur introuvable." }
  }
  const cible = Number(cibleBrut)
  const delaiJours = Number(delaiBrut)
  await db.regleReappro.upsert({
    where: { etablissementId_ingredientId: { etablissementId: etabId, ingredientId: ing.id } },
    create: { etablissementId: etabId, ingredientId: ing.id, cible, fournisseurId: fournisseurId || null, delaiJours },
    update: { cible, fournisseurId: fournisseurId || null, delaiJours, actif: true },
  })
  await audit(session, "REGLE_ENREGISTREE", ing.id, ing.name + " · cible " + cible)
  rafraichir()
  return { ok: "Règle enregistrée pour " + ing.name + "." }
}

export async function basculerRegle(id: string, _fd: FormData): Promise<void> {
  const acces = await accesReapproEcriture()
  if ("erreur" in acces) return
  const { session, etabId } = acces
  const r = await db.regleReappro.findFirst({ where: { id, etablissementId: etabId }, include: { ingredient: { select: { name: true } } } })
  if (!r) return
  await db.regleReappro.update({ where: { id: r.id }, data: { actif: !r.actif } })
  await audit(session, r.actif ? "REGLE_DESACTIVEE" : "REGLE_ACTIVEE", r.id, r.ingredient.name)
  rafraichir()
}

export async function supprimerRegle(id: string, _fd: FormData): Promise<void> {
  const acces = await accesReapproEcriture()
  if ("erreur" in acces) return
  const { session, etabId } = acces
  const r = await db.regleReappro.findFirst({ where: { id, etablissementId: etabId }, include: { ingredient: { select: { name: true } } } })
  if (!r) return
  await db.regleReappro.delete({ where: { id: r.id } })
  await audit(session, "REGLE_SUPPRIMEE", r.id, r.ingredient.name)
  rafraichir()
}

export async function genererBons(_p: EtatAction, _fd: FormData): Promise<EtatAction> {
  const acces = await accesReapproEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const r = await genererBonsReappro(etabId)
  if (r.bons === 0) return { error: "Aucun bon à créer : rien à commander, ou aucun fournisseur défini pour les ingrédients manquants." }
  await audit(session, "REAPPRO_BONS", etabId, r.bons + " bon(s), " + r.lignes + " ligne(s), " + r.sansFournisseur + " sans fournisseur")
  rafraichir()
  return { ok: r.bons + " bon(s) brouillon créé(s) ou complété(s) pour " + r.lignes + " ingrédient(s)." + (r.sansFournisseur > 0 ? " " + r.sansFournisseur + " ingrédient(s) sans fournisseur ignoré(s)." : "") }
}