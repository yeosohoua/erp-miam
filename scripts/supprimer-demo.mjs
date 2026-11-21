import "dotenv/config"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../src/generated/prisma/client.ts"
import { supprimerDemo } from "./demo-outils.mjs"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const CONFIRMER = process.argv.includes("--confirmer")

async function principal() {
  const avant = { etablissements: await db.etablissement.count(), utilisateurs: await db.user.count(), admins: await db.user.count({ where: { role: "ADMIN" } }) }
  const r = await supprimerDemo(db, { confirmer: CONFIRMER })
  if (r.etablissements.length === 0) {
    console.log("Aucune donnee de demonstration presente.")
  } else {
    console.log((CONFIRMER ? "SUPPRIME" : "A SUPPRIMER (previsualisation, rien n'est efface)") + " : etablissements " + r.etablissements.join(", "))
    for (const [k, v] of Object.entries(r.comptes)) console.log("  " + k.padEnd(14) + v)
    console.log("  utilisateurs : " + (r.utilisateurs.length ? r.utilisateurs.join(" | ") : "aucun"))
    if (r.conserves.length) console.log("  conserves : " + r.conserves.join(" | "))
  }
  const apres = { etablissements: await db.etablissement.count(), utilisateurs: await db.user.count(), admins: await db.user.count({ where: { role: "ADMIN" } }) }
  console.log(`Avant : ${avant.etablissements} etablissements, ${avant.utilisateurs} utilisateurs, ${avant.admins} admin(s)`)
  console.log(`Apres : ${apres.etablissements} etablissements, ${apres.utilisateurs} utilisateurs, ${apres.admins} admin(s)`)
  if (CONFIRMER && apres.admins !== avant.admins) throw new Error("Le nombre d'administrateurs a change : anomalie")
  if (!CONFIRMER && r.etablissements.length) console.log("Pour supprimer : npx tsx scripts\\supprimer-demo.mjs --confirmer")
}

principal()
  .catch((e) => { console.error("Echec : " + (e && e.message ? e.message : e)); process.exitCode = 1 })
  .finally(() => db.$disconnect())