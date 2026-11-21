"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { accesCaisseConfig } from "@/lib/caisse-acces"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"

const CHEMIN = "/parametres/categories-articles"
const USUELLES = ["Boissons", "Plats chauds", "Snacks", "Desserts", "Fruits", "Pâtisseries", "Petit-déjeuner"]

const estDoublon = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002"

function lireNom(fd: FormData): string | { erreur: string } {
  const nom = String(fd.get("nom") ?? "").trim().replace(/\s+/g, " ")
  if (nom.length < 2 || nom.length > 40) return { erreur: "Le nom doit contenir entre 2 et 40 caractères." }
  return nom
}

export async function ajouterCategorie(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const a = await accesCaisseConfig()
  if ("erreur" in a) return { error: a.erreur }
  const nom = lireNom(fd)
  if (typeof nom !== "string") return { error: nom.erreur }
  const dernier = await db.categorieArticle.aggregate({ where: { etablissementId: a.etabId }, _max: { ordre: true } })
  try {
    const c = await db.categorieArticle.create({ data: { etablissementId: a.etabId, nom, ordre: (dernier._max.ordre ?? 0) + 1 } })
    await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "CATEGORIE_ARTICLE_CREEE", entity: "CategorieArticle", entityId: c.id, details: nom })
  } catch (e) {
    if (estDoublon(e)) return { error: "Cette catégorie existe déjà." }
    throw e
  }
  revalidatePath(CHEMIN)
  return { ok: "Catégorie « " + nom + " » ajoutée." }
}

// Le renommage met aussi a jour les articles deja rattaches a l'ancien nom.
export async function modifierCategorie(id: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const a = await accesCaisseConfig()
  if ("erreur" in a) return { error: a.erreur }
  const nom = lireNom(fd)
  if (typeof nom !== "string") return { error: nom.erreur }
  const ordre = Number.parseInt(String(fd.get("ordre") ?? "0"), 10)
  if (!Number.isInteger(ordre) || ordre < 0 || ordre > 999) return { error: "L'ordre doit être un nombre entre 0 et 999." }
  const c = await db.categorieArticle.findFirst({ where: { id, etablissementId: a.etabId } })
  if (!c) return { error: "Catégorie introuvable." }
  try {
    await db.$transaction(async (tx) => {
      await tx.categorieArticle.update({ where: { id: c.id }, data: { nom, ordre } })
      if (nom !== c.nom) await tx.articleCarte.updateMany({ where: { etablissementId: a.etabId, categorie: c.nom }, data: { categorie: nom } })
    })
  } catch (e) {
    if (estDoublon(e)) return { error: "Une catégorie porte déjà ce nom." }
    throw e
  }
  await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "CATEGORIE_ARTICLE_MODIFIEE", entity: "CategorieArticle", entityId: c.id, details: c.nom + " -> " + nom })
  revalidatePath(CHEMIN)
  return { ok: "Catégorie enregistrée." }
}

export async function basculerCategorie(id: string, _fd: FormData): Promise<void> {
  const a = await accesCaisseConfig()
  if ("erreur" in a) return
  const c = await db.categorieArticle.findFirst({ where: { id, etablissementId: a.etabId } })
  if (!c) return
  await db.categorieArticle.update({ where: { id: c.id }, data: { active: !c.active } })
  await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: c.active ? "CATEGORIE_ARTICLE_DESACTIVEE" : "CATEGORIE_ARTICLE_ACTIVEE", entity: "CategorieArticle", entityId: c.id, details: c.nom })
  revalidatePath(CHEMIN)
}

// Les articles gardent leur texte de categorie : seule la categorie disparait de la liste.
export async function supprimerCategorie(id: string, _fd: FormData): Promise<void> {
  const a = await accesCaisseConfig()
  if ("erreur" in a) return
  const c = await db.categorieArticle.findFirst({ where: { id, etablissementId: a.etabId } })
  if (!c) return
  await db.categorieArticle.delete({ where: { id: c.id } })
  await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "CATEGORIE_ARTICLE_SUPPRIMEE", entity: "CategorieArticle", entityId: c.id, details: c.nom })
  revalidatePath(CHEMIN)
}

export async function semerCategories(_etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  const a = await accesCaisseConfig()
  if ("erreur" in a) return { error: a.erreur }
  const dernier = await db.categorieArticle.aggregate({ where: { etablissementId: a.etabId }, _max: { ordre: true } })
  let ordre = dernier._max.ordre ?? 0
  const r = await db.categorieArticle.createMany({ data: USUELLES.map((nom) => ({ etablissementId: a.etabId, nom, ordre: ++ordre })), skipDuplicates: true })
  await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "CATEGORIES_ARTICLES_USUELLES", entity: "CategorieArticle", entityId: a.etabId, details: r.count + " ajoutée(s)" })
  revalidatePath(CHEMIN)
  return { ok: r.count > 0 ? r.count + " catégorie(s) ajoutée(s)." : "Toutes les catégories usuelles existent déjà." }
}