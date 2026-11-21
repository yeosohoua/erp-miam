"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { dateValide, serviceValide, versDate } from "@/lib/menus"
import { accesNutritionEcriture } from "@/lib/nutrition-acces"
import { calculerPropositions } from "@/lib/nutrition-propositions"
import { referencePour } from "@/lib/nutrition-reference"
import type { SessionData } from "@/lib/session-token"

const rafraichir = () => {
  revalidatePath("/nutrition", "layout")
  revalidatePath("/menus", "layout")
}
const nettoyer = (v: FormDataEntryValue | null): string => String(v ?? "").trim()

async function audit(session: SessionData, action: string, entityId: string, details: string): Promise<void> {
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action, entity: "Nutrition", entityId, details })
}

function decimal(s: string): number {
  const t = s.replace(",", ".")
  return /^\d{1,3}(\.\d{1,2})?$/.test(t) ? Number(t) : NaN
}

export async function enregistrerValeurs(_p: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesNutritionEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const ingredientId = nettoyer(fd.get("ingredientId"))
  const kcalTxt = nettoyer(fd.get("kcal"))
  const proteines = decimal(nettoyer(fd.get("proteines")))
  const glucides = decimal(nettoyer(fd.get("glucides")))
  const lipides = decimal(nettoyer(fd.get("lipides")))
  const fibres = nettoyer(fd.get("fibres")) === "" ? 0 : decimal(nettoyer(fd.get("fibres")))
  if (!ingredientId) return { error: "Choisissez un ingrédient." }
  if (!/^\d{1,4}$/.test(kcalTxt) || Number(kcalTxt) > 900) return { error: "Énergie invalide : de 0 à 900 kcal pour 100 g." }
  if ([proteines, glucides, lipides, fibres].some((n) => Number.isNaN(n) || n > 100)) return { error: "Valeurs invalides : de 0 à 100 g pour 100 g." }
  if (proteines + glucides + lipides > 100.5) return { error: "Protéines, glucides et lipides dépassent 100 g pour 100 g." }
  const ing = await db.ingredient.findFirst({ where: { id: ingredientId, etablissementId: etabId }, select: { id: true, name: true } })
  if (!ing) return { error: "Ingrédient introuvable." }
  const kcal = Number(kcalTxt)
  await db.nutritionIngredient.upsert({
    where: { ingredientId: ing.id },
    create: { ingredientId: ing.id, kcal, proteines, glucides, lipides, fibres },
    update: { kcal, proteines, glucides, lipides, fibres },
  })
  await audit(session, "NUTRITION_SAISIE", ing.id, ing.name + " · " + kcal + " kcal/100 g")
  rafraichir()
  return { ok: "Valeurs enregistrées pour " + ing.name + "." }
}

export async function importerReference(_p: EtatAction, _fd: FormData): Promise<EtatAction> {
  const acces = await accesNutritionEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const manquants = await db.ingredient.findMany({ where: { etablissementId: etabId, nutrition: { is: null } }, select: { id: true, name: true } })
  let crees = 0
  let sans = 0
  for (const ing of manquants) {
    const ref = referencePour(ing.name)
    if (!ref) {
      sans += 1
      continue
    }
    await db.nutritionIngredient.create({ data: { ingredientId: ing.id, ...ref.valeurs } })
    crees += 1
  }
  await audit(session, "NUTRITION_IMPORT", etabId, crees + " importé(s), " + sans + " sans équivalent")
  rafraichir()
  return { ok: "Import terminé : " + crees + " ingrédient(s) renseigné(s), " + sans + " sans équivalent." }
}

export async function retirerValeurs(ingredientId: string, _fd: FormData): Promise<void> {
  const acces = await accesNutritionEcriture()
  if ("erreur" in acces) return
  const { session, etabId } = acces
  const ing = await db.ingredient.findFirst({ where: { id: ingredientId, etablissementId: etabId }, select: { id: true, name: true } })
  if (!ing) return
  await db.nutritionIngredient.deleteMany({ where: { ingredientId: ing.id } })
  await audit(session, "NUTRITION_RETIREE", ing.id, ing.name)
  rafraichir()
}

export async function creerBrouillons(_p: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesNutritionEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const service = nettoyer(fd.get("service"))
  const debut = nettoyer(fd.get("debut"))
  if (!serviceValide(service)) return { error: "Service invalide." }
  if (!dateValide(debut)) return { error: "Date de début invalide." }
  const brut = nettoyer(fd.get("budget")).replace(",", ".")
  const budget = brut !== "" && Number.isFinite(Number(brut)) && Number(brut) >= 0 ? Number(brut) : null
  const exclus = fd.getAll("exclus").map((v) => String(v))
  const props = await calculerPropositions(etabId, { service, debut, budget, exclus })
  if (props.length === 0) return { error: "Aucune proposition possible avec ces critères." }
  let crees = 0
  let ignores = 0
  for (const pr of props) {
    const date = versDate(pr.date)
    const existant = await db.menu.findUnique({ where: { etablissementId_date_service: { etablissementId: etabId, date, service } } })
    if (existant) {
      ignores += 1
      continue
    }
    await db.menu.create({ data: { etablissementId: etabId, date, service, statut: "DRAFT", plats: { create: [{ platId: pr.platId }] } } })
    crees += 1
  }
  await audit(session, "NUTRITION_BROUILLONS", etabId, service + " · " + debut + " · " + crees + " créé(s), " + ignores + " ignoré(s)")
  rafraichir()
  return { ok: crees + " brouillon(s) de menu créé(s), " + ignores + " jour(s) déjà planifié(s)." }
}