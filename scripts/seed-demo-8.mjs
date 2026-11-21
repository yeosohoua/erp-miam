import "dotenv/config"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../src/generated/prisma/client.ts"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const OBJECTIFS = [
  { kpi: "satisfaction", cible: 4, sens: "MAX" },
  { kpi: "conformite_temperatures", cible: 95, sens: "MAX" },
  { kpi: "nc_ouvertes", cible: 0, sens: "MIN" },
  { kpi: "stock_critique", cible: 0, sens: "MIN" },
  { kpi: "factures_retard", cible: 0, sens: "MIN" },
]
const etabs = await db.etablissement.findMany({ where: { code: { in: ["GSL-COCODY", "CE-PLATEAU"] } } })
if (etabs.length === 0) console.log("Aucun établissement de démonstration : rien à faire.")
for (const etab of etabs) {
  if ((await db.objectifKpi.count({ where: { etablissementId: etab.id } })) > 0) {
    console.log(etab.code + " : objectifs déjà présents")
    continue
  }
  for (const o of OBJECTIFS) await db.objectifKpi.create({ data: { etablissementId: etab.id, kpi: o.kpi, cible: o.cible, sens: o.sens, updatedBy: "demo@miam.test" } })
  console.log(etab.code + " : " + OBJECTIFS.length + " objectifs créés")
}
await db.$disconnect()
console.log("=== SEED DEMO 8 OK ===")