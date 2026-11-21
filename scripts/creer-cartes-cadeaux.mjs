import "dotenv/config"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../src/generated/prisma/client.ts"
import { formaterCarte, genererCarte, hacherCarte } from "../src/lib/cartes-cadeaux.ts"

// Cartes cadeaux de demonstration : 3 par etablissement prepaye (2 000, 5 000 et 10 000). Les codes ne sont affiches qu'ici.
// Suppression : delete from cartes_cadeaux;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

async function principal() {
  const etabs = await db.etablissement.findMany({ where: { prepaye: true, active: true }, select: { id: true, code: true, name: true } })
  if (etabs.length === 0) console.log("Aucun etablissement prepaye actif.")
  for (const e of etabs) {
    console.log("##### " + e.name + " (" + e.code + ")")
    for (const montant of [2000, 5000, 10000]) {
      const code = genererCarte()
      await db.carteCadeau.create({ data: { etablissementId: e.id, codeHash: hacherCarte(code), montant } })
      console.log("  " + montant + " F  ->  " + formaterCarte(code))
    }
  }
}

principal()
  .catch((e) => { console.log("ERREUR : " + e.message); process.exitCode = 1 })
  .finally(() => db.$disconnect())