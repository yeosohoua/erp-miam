import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client.ts"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const MARQUE = "[Démo] "
const retirer = process.argv.includes("--retirer")

async function main() {
  if (retirer) {
    const r = await db.transfert.deleteMany({ where: { note: { startsWith: MARQUE }, statut: "PREPARE" } })
    console.log("Transferts de démonstration retirés : " + r.count)
    return
  }
  const source = await db.etablissement.findUnique({ where: { code: "GSL-COCODY" } })
  const dest = await db.etablissement.findUnique({ where: { code: "CE-PLATEAU" } })
  if (!source || !dest) {
    console.log("Etablissements de démonstration absents (GSL-COCODY / CE-PLATEAU) : rien à faire.")
    return
  }
  if (await db.transfert.count({ where: { sourceId: source.id, note: { startsWith: MARQUE } } })) {
    console.log("Transfert de démonstration déjà présent.")
    return
  }
  const ings = await db.ingredient.findMany({ where: { etablissementId: source.id, stock: { gt: 0 } }, orderBy: { stock: "desc" }, take: 3 })
  if (ings.length === 0) {
    console.log("Aucun ingrédient en stock dans " + source.code + " : transfert de démonstration non créé.")
    return
  }
  const max = await db.transfert.aggregate({ where: { sourceId: source.id }, _max: { numero: true } })
  const t = await db.transfert.create({
    data: {
      sourceId: source.id,
      destId: dest.id,
      numero: (max._max.numero ?? 0) + 1,
      note: MARQUE + "Livraison hebdomadaire vers " + dest.name,
      creePar: "demo",
      lignes: { create: ings.map((i) => ({ ingredientId: i.id, ingredientNom: i.name, unite: i.unit, quantite: Math.max(1, Math.floor(Number(i.stock) * 0.1)) })) },
    },
  })
  console.log("Transfert de démonstration n° " + t.numero + " préparé de " + source.code + " vers " + dest.code + " (" + ings.length + " ligne(s)). Retrait : npx tsx scripts\\seed-demo-9.mjs --retirer")
}

main()
  .catch((e) => {
    console.error("ERREUR : " + e.message)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())