import "dotenv/config"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../src/generated/prisma/client.ts"
import { referencePour } from "../src/lib/nutrition-reference.ts"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const etabs = await db.etablissement.findMany({ where: { code: { in: ["GSL-COCODY", "CE-PLATEAU"] } } })
if (etabs.length === 0) console.log("Aucun établissement de démonstration : rien à faire.")
for (const etab of etabs) {
  const manquants = await db.ingredient.findMany({ where: { etablissementId: etab.id, nutrition: { is: null } }, select: { id: true, name: true } })
  let crees = 0
  const sans = []
  for (const ing of manquants) {
    const ref = referencePour(ing.name)
    if (!ref) {
      sans.push(ing.name)
      continue
    }
    await db.nutritionIngredient.create({ data: { ingredientId: ing.id, ...ref.valeurs } })
    crees += 1
  }
  console.log(etab.code + " : " + crees + " ingrédient(s) renseigné(s)" + (sans.length ? ", sans équivalent : " + sans.join(", ") : ""))
}
await db.$disconnect()
console.log("=== SEED DEMO 6 OK ===")