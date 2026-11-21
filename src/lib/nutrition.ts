import "server-only"

import { db } from "@/lib/db"
import { ajouterJours, aujourdhui, versDate } from "@/lib/menus"
import { nutritionPlat, type Valeurs } from "@/lib/nutrition-base"
import { densitePour } from "@/lib/nutrition-reference"
import { JOURS_ALERTE } from "@/lib/stock-base"

export type PlatNutrition = {
  id: string
  nom: string
  portions: number
  parPortion: Valeurs
  manquants: number
  nbLignes: number
  cout: number
  allergenes: string[]
  antiGaspi: number
}

// Lit la valeur textuelle d'une ligne IngredientAllergen sans supposer le nom du champ.
export function valeurAllergene(row: unknown): string | null {
  const r = row as Record<string, unknown>
  for (const [k, val] of Object.entries(r)) {
    if (typeof val === "string" && k !== "ingredientId" && k !== "id") return val
  }
  return null
}

export async function chargerPlats(etabId: string): Promise<PlatNutrition[]> {
  const limite = versDate(ajouterJours(aujourdhui(), JOURS_ALERTE))
  const [plats, lots] = await Promise.all([
    db.plat.findMany({
      where: { etablissementId: etabId, active: true },
      orderBy: { name: "asc" },
      include: { ingredients: { include: { ingredient: { include: { nutrition: true, allergens: true } } } } },
    }),
    db.lot.findMany({ where: { etablissementId: etabId, restante: { gt: 0 }, peremption: { not: null, lte: limite } }, select: { ingredientId: true } }),
  ])
  const urgents = new Set(lots.map((l) => l.ingredientId))
  return plats.map((p) => {
    const lignes = p.ingredients.map((l) => {
      const n = l.ingredient.nutrition
      return {
        quantite: Number(l.quantity),
        unite: l.ingredient.unit,
        densite: densitePour(l.ingredient.name),
        valeurs: n ? { kcal: n.kcal, proteines: Number(n.proteines), glucides: Number(n.glucides), lipides: Number(n.lipides), fibres: Number(n.fibres) } : null,
      }
    })
    const { parPortion, manquants } = nutritionPlat(lignes, p.portions)
    const portions = p.portions > 0 ? p.portions : 1
    const cout = p.ingredients.reduce((s, l) => s + Number(l.quantity) * Number(l.ingredient.unitCost), 0) / portions
    const allergenes = Array.from(new Set(p.ingredients.flatMap((l) => l.ingredient.allergens.map((a) => valeurAllergene(a)).filter((x): x is string => x !== null)))).sort()
    const antiGaspi = p.ingredients.filter((l) => urgents.has(l.ingredientId)).length
    return { id: p.id, nom: p.name, portions: p.portions, parPortion, manquants, nbLignes: p.ingredients.length, cout, allergenes, antiGaspi }
  })
}