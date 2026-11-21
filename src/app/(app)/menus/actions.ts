"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { ecrireAudit } from "@/lib/audit"
import { lireFichierImage } from "@/lib/image-stockage"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { ajouterJours, dateValide, lundiDe, parseNombre, serviceValide, uniteValide, versDate, versIso, type ServiceMenu } from "@/lib/menus"
import { accesMenusEcriture } from "@/lib/menus-acces"

const rafraichir = () => revalidatePath("/menus", "layout")
const doublon = (e: unknown): boolean => (e as { code?: string }).code === "P2002"

async function lireAllergenes(etabId: string, fd: FormData): Promise<{ erreur: string } | string[]> {
  const ids = [...new Set(fd.getAll("allergenes").map(String))]
  if (ids.length === 0) return ids
  const n = await db.referentiel.count({ where: { id: { in: ids }, etablissementId: etabId, kind: "ALLERGIE" } })
  return n === ids.length ? ids : { erreur: "Allergène inconnu." }
}

function lireNomEtDescription(fd: FormData): { erreur: string } | { nom: string; description: string | null } {
  const nom = String(fd.get("nom") ?? "").trim()
  if (nom.length < 1 || nom.length > 80) return { erreur: "Le nom est obligatoire (80 caractères maximum)." }
  const description = String(fd.get("description") ?? "").trim()
  if (description.length > 200) return { erreur: "La description est limitée à 200 caractères." }
  return { nom, description: description || null }
}

// ---------- Ingredients ----------
export async function creerIngredient(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesMenusEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const nom = String(fd.get("nom") ?? "").trim()
  if (nom.length < 1 || nom.length > 80) return { error: "Le nom est obligatoire (80 caractères maximum)." }
  const unite = String(fd.get("unite") ?? "")
  if (!uniteValide(unite)) return { error: "Unité invalide." }
  const cout = parseNombre(String(fd.get("cout") ?? ""))
  if (cout === null) return { error: "Coût unitaire invalide (nombre positif, 4 décimales maximum)." }
  const allergenes = await lireAllergenes(etabId, fd)
  if ("erreur" in allergenes) return { error: allergenes.erreur }
  if (await db.ingredient.findUnique({ where: { etablissementId_name: { etablissementId: etabId, name: nom } }, select: { id: true } })) return { error: "Ce nom d'ingrédient existe déjà." }
  try {
    const cree = await db.ingredient.create({
      data: { etablissementId: etabId, name: nom, unit: unite, unitCost: cout, allergens: { create: allergenes.map((allergieId) => ({ allergieId })) } },
    })
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "INGREDIENT_CREATED", entity: "Ingredient", entityId: cree.id, details: nom })
  } catch (e) {
    if (doublon(e)) return { error: "Ce nom d'ingrédient existe déjà." }
    throw e
  }
  rafraichir()
  return { ok: "Ingrédient créé : " + nom }
}

export async function modifierIngredient(id: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesMenusEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  if (!(await db.ingredient.findFirst({ where: { id, etablissementId: etabId }, select: { id: true } }))) return { error: "Cet ingrédient n'existe plus." }
  const nom = String(fd.get("nom") ?? "").trim()
  if (nom.length < 1 || nom.length > 80) return { error: "Le nom est obligatoire (80 caractères maximum)." }
  const unite = String(fd.get("unite") ?? "")
  if (!uniteValide(unite)) return { error: "Unité invalide." }
  const cout = parseNombre(String(fd.get("cout") ?? ""))
  if (cout === null) return { error: "Coût unitaire invalide (nombre positif, 4 décimales maximum)." }
  const allergenes = await lireAllergenes(etabId, fd)
  if ("erreur" in allergenes) return { error: allergenes.erreur }
  if (await db.ingredient.findFirst({ where: { etablissementId: etabId, name: nom, id: { not: id } }, select: { id: true } })) return { error: "Ce nom d'ingrédient existe déjà." }
  await db.$transaction([
    db.ingredient.update({ where: { id }, data: { name: nom, unit: unite, unitCost: cout } }),
    db.ingredientAllergen.deleteMany({ where: { ingredientId: id } }),
    db.ingredientAllergen.createMany({ data: allergenes.map((allergieId) => ({ ingredientId: id, allergieId })) }),
  ])
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "INGREDIENT_UPDATED", entity: "Ingredient", entityId: id, details: nom })
  rafraichir()
  return { ok: "Ingrédient enregistré." }
}

export async function supprimerIngredient(id: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _fd
  const acces = await accesMenusEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const ing = await db.ingredient.findFirst({ where: { id, etablissementId: acces.etabId }, select: { name: true } })
  if (!ing) return { error: "Cet ingrédient n'existe plus." }
  const usage = await db.platIngredient.count({ where: { ingredientId: id } })
  if (usage > 0) return { error: "Utilisé dans " + usage + " plat(s) : suppression impossible." }
  const historique = (await db.lot.count({ where: { ingredientId: id } })) + (await db.mouvementStock.count({ where: { ingredientId: id } })) + (await db.bonCommandeLigne.count({ where: { ingredientId: id } }))
  if (historique > 0) return { error: "Cet ingrédient a un historique de stock ou d'achats : suppression impossible." }
  await db.ingredient.delete({ where: { id } })
  await ecrireAudit({ userId: acces.session.userId, userEmail: acces.session.email, action: "INGREDIENT_DELETED", entity: "Ingredient", entityId: id, details: ing.name })
  rafraichir()
  redirect("/menus/ingredients")
}

// ---------- Plats ----------
function lirePortions(fd: FormData): number | null {
  const v = String(fd.get("portions") ?? "").trim()
  if (!/^\d{1,4}$/.test(v)) return null
  const n = Number(v)
  return n >= 1 && n <= 1000 ? n : null
}

export async function creerPlat(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesMenusEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const base = lireNomEtDescription(fd)
  if ("erreur" in base) return { error: base.erreur }
  const portions = lirePortions(fd)
  if (portions === null) return { error: "Portions invalides (entier entre 1 et 1000)." }
  if (await db.plat.findUnique({ where: { etablissementId_name: { etablissementId: etabId, name: base.nom } }, select: { id: true } })) return { error: "Ce nom de plat existe déjà." }
  try {
    const brut = fd.get("image")
    const aImage = typeof brut !== "string" && brut !== null && brut.size > 0
    const lu = aImage ? await lireFichierImage(brut) : null
    if (lu && "erreur" in lu) return { error: lu.erreur }
    const img = lu ? await db.image.create({ data: { etablissementId: etabId, mime: lu.mime, taille: lu.octets.byteLength, donnees: lu.octets } }) : null
    const cree = await db.plat.create({ data: { etablissementId: etabId, name: base.nom, description: base.description, portions, imageId: img?.id ?? null } })
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "PLAT_CREATED", entity: "Plat", entityId: cree.id, details: base.nom })
  } catch (e) {
    if (doublon(e)) return { error: "Ce nom de plat existe déjà." }
    throw e
  }
  rafraichir()
  return { ok: "Plat créé : " + base.nom }
}

export async function modifierPlat(id: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesMenusEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  if (!(await db.plat.findFirst({ where: { id, etablissementId: etabId }, select: { id: true } }))) return { error: "Ce plat n'existe plus." }
  const base = lireNomEtDescription(fd)
  if ("erreur" in base) return { error: base.erreur }
  const portions = lirePortions(fd)
  if (portions === null) return { error: "Portions invalides (entier entre 1 et 1000)." }
  if (await db.plat.findFirst({ where: { etablissementId: etabId, name: base.nom, id: { not: id } }, select: { id: true } })) return { error: "Ce nom de plat existe déjà." }
  await db.plat.update({ where: { id }, data: { name: base.nom, description: base.description, portions, active: fd.get("actif") === "on" } })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "PLAT_UPDATED", entity: "Plat", entityId: id, details: base.nom })
  rafraichir()
  return { ok: "Plat enregistré." }
}

export async function ajouterLigne(platId: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesMenusEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const plat = await db.plat.findFirst({ where: { id: platId, etablissementId: etabId }, select: { name: true } })
  if (!plat) return { error: "Ce plat n'existe plus." }
  const ingredientId = String(fd.get("ingredient") ?? "")
  const ing = await db.ingredient.findFirst({ where: { id: ingredientId, etablissementId: etabId }, select: { name: true } })
  if (!ing) return { error: "Ingrédient inconnu." }
  const q = parseNombre(String(fd.get("quantite") ?? ""))
  if (q === null || q <= 0 || q > 999999) return { error: "Quantité invalide (nombre supérieur à 0)." }
  await db.platIngredient.upsert({
    where: { platId_ingredientId: { platId, ingredientId } },
    create: { platId, ingredientId, quantity: q },
    update: { quantity: q },
  })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "PLAT_INGREDIENT_ADDED", entity: "Plat", entityId: platId, details: plat.name + " / " + ing.name })
  rafraichir()
  return { ok: "Ingrédient ajouté." }
}

export async function retirerLigne(platId: string, ingredientId: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _fd
  const acces = await accesMenusEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const plat = await db.plat.findFirst({ where: { id: platId, etablissementId: acces.etabId }, select: { name: true } })
  if (!plat) return { error: "Ce plat n'existe plus." }
  await db.platIngredient.deleteMany({ where: { platId, ingredientId } })
  await ecrireAudit({ userId: acces.session.userId, userEmail: acces.session.email, action: "PLAT_INGREDIENT_REMOVED", entity: "Plat", entityId: platId, details: plat.name })
  rafraichir()
  return { ok: "Ingrédient retiré." }
}

export async function supprimerPlat(id: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _fd
  const acces = await accesMenusEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const plat = await db.plat.findFirst({ where: { id, etablissementId: acces.etabId }, select: { name: true } })
  if (!plat) return { error: "Ce plat n'existe plus." }
  const usage = await db.menuPlat.count({ where: { platId: id } })
  if (usage > 0) return { error: "Utilisé dans " + usage + " menu(s) : suppression impossible. Désactivez-le plutôt." }
  await db.plat.delete({ where: { id } })
  await ecrireAudit({ userId: acces.session.userId, userEmail: acces.session.email, action: "PLAT_DELETED", entity: "Plat", entityId: id, details: plat.name })
  rafraichir()
  redirect("/menus/plats")
}

// ---------- Menus ----------
function lireCreneau(dateIso: string, service: string): { erreur: string } | { date: Date; service: ServiceMenu } {
  if (!dateValide(dateIso) || !serviceValide(service)) return { erreur: "Créneau invalide." }
  return { date: versDate(dateIso), service }
}

export async function ajouterPlatMenu(dateIso: string, service: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesMenusEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const c = lireCreneau(dateIso, service)
  if ("erreur" in c) return { error: c.erreur }
  const plat = await db.plat.findFirst({ where: { id: String(fd.get("plat") ?? ""), etablissementId: etabId, active: true }, select: { id: true, name: true } })
  if (!plat) return { error: "Plat inconnu ou désactivé." }
  const menu = await db.menu.upsert({
    where: { etablissementId_date_service: { etablissementId: etabId, date: c.date, service: c.service } },
    create: { etablissementId: etabId, date: c.date, service: c.service },
    update: {},
  })
  if (menu.statut === "PUBLISHED") return { error: "Dépubliez le menu avant de le modifier." }
  await db.menuPlat.createMany({ data: [{ menuId: menu.id, platId: plat.id }], skipDuplicates: true })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "MENU_PLAT_ADDED", entity: "Menu", entityId: menu.id, details: dateIso + " " + c.service + " " + plat.name })
  rafraichir()
  return { ok: "Plat ajouté au menu." }
}

export async function retirerPlatMenu(dateIso: string, service: string, platId: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _fd
  const acces = await accesMenusEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const c = lireCreneau(dateIso, service)
  if ("erreur" in c) return { error: c.erreur }
  const menu = await db.menu.findUnique({ where: { etablissementId_date_service: { etablissementId: acces.etabId, date: c.date, service: c.service } } })
  if (!menu) return { error: "Ce menu n'existe plus." }
  if (menu.statut === "PUBLISHED") return { error: "Dépubliez le menu avant de le modifier." }
  await db.menuPlat.deleteMany({ where: { menuId: menu.id, platId } })
  await ecrireAudit({ userId: acces.session.userId, userEmail: acces.session.email, action: "MENU_PLAT_REMOVED", entity: "Menu", entityId: menu.id, details: dateIso + " " + c.service })
  rafraichir()
  return { ok: "Plat retiré du menu." }
}

export async function basculerPublication(dateIso: string, service: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _fd
  const acces = await accesMenusEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const c = lireCreneau(dateIso, service)
  if ("erreur" in c) return { error: c.erreur }
  const menu = await db.menu.findUnique({
    where: { etablissementId_date_service: { etablissementId: acces.etabId, date: c.date, service: c.service } },
    include: { _count: { select: { plats: true } } },
  })
  if (!menu) return { error: "Ce menu n'existe plus." }
  const publier = menu.statut === "DRAFT"
  if (publier && menu._count.plats === 0) return { error: "Ajoutez au moins un plat avant de publier." }
  await db.menu.update({ where: { id: menu.id }, data: { statut: publier ? "PUBLISHED" : "DRAFT" } })
  await ecrireAudit({ userId: acces.session.userId, userEmail: acces.session.email, action: publier ? "MENU_PUBLISHED" : "MENU_UNPUBLISHED", entity: "Menu", entityId: menu.id, details: dateIso + " " + c.service })
  rafraichir()
  return { ok: publier ? "Menu publié." : "Menu dépublié." }
}

export async function supprimerMenu(dateIso: string, service: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _fd
  const acces = await accesMenusEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const c = lireCreneau(dateIso, service)
  if ("erreur" in c) return { error: c.erreur }
  const menu = await db.menu.findUnique({ where: { etablissementId_date_service: { etablissementId: acces.etabId, date: c.date, service: c.service } } })
  if (!menu) return { error: "Ce menu n'existe plus." }
  if (menu.statut === "PUBLISHED") return { error: "Dépubliez le menu avant de le supprimer." }
  await db.menu.delete({ where: { id: menu.id } })
  await ecrireAudit({ userId: acces.session.userId, userEmail: acces.session.email, action: "MENU_DELETED", entity: "Menu", entityId: menu.id, details: dateIso + " " + c.service })
  rafraichir()
  redirect("/menus?semaine=" + lundiDe(dateIso))
}

// Copie les menus de la semaine precedente vers la semaine affichee, sans jamais ecraser un creneau deja rempli.
export async function dupliquerSemainePrecedente(lundi: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _fd
  const acces = await accesMenusEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  if (!dateValide(lundi) || lundiDe(lundi) !== lundi) return { error: "Semaine invalide." }
  const { session, etabId } = acces
  const source = ajouterJours(lundi, -7)
  const fin = ajouterJours(lundi, 7)

  const [sources, cibles] = await Promise.all([
    db.menu.findMany({ where: { etablissementId: etabId, date: { gte: versDate(source), lt: versDate(lundi) } }, include: { plats: { include: { plat: { select: { active: true } } } } } }),
    db.menu.findMany({ where: { etablissementId: etabId, date: { gte: versDate(lundi), lt: versDate(fin) } }, select: { date: true, service: true } }),
  ])
  const pris = new Set(cibles.map((m) => versIso(m.date) + "_" + m.service))
  const aCopier = sources
    .map((m) => ({ m, platIds: m.plats.filter((p) => p.plat.active).map((p) => p.platId) }))
    .filter(({ m, platIds }) => platIds.length > 0 && !pris.has(ajouterJours(versIso(m.date), 7) + "_" + m.service))
  if (aCopier.length === 0) return { ok: "Aucun menu à copier (semaine précédente vide ou créneaux déjà remplis)." }

  await db.$transaction(
    aCopier.map(({ m, platIds }) =>
      db.menu.create({
        data: { etablissementId: etabId, date: versDate(ajouterJours(versIso(m.date), 7)), service: m.service, plats: { create: platIds.map((platId) => ({ platId })) } },
      }),
    ),
  )
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "MENU_WEEK_COPIED", details: aCopier.length + " menu(s) vers la semaine du " + lundi })
  rafraichir()
  return { ok: aCopier.length + " menu(s) copié(s) en brouillon." }
}