import "dotenv/config"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../src/generated/prisma/client.ts"

const appliquer = process.argv.includes("--appliquer")
const dossier = "C:\\wamp64\\www\\Miam_sauvegardes"
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

let plan = []
let source = ""
for (const f of readdirSync(dossier).filter((x) => /^matricules_avant_.*\.json$/.test(x)).sort().reverse()) {
  const lu = JSON.parse(readFileSync(join(dossier, f), "utf8"))
  if (Array.isArray(lu) && lu.length > 0) {
    plan = lu
    source = f
    break
  }
}
if (plan.length === 0) {
  console.log("Aucune sauvegarde de matricules exploitable.")
  await db.$disconnect()
  process.exit(1)
}
console.log("Sauvegarde utilisee : " + source + " (" + plan.length + " entrees)")

const aRestaurer = []
const ignores = []
let deja = 0
for (const p of plan) {
  const i = await db.inscrit.findUnique({ where: { id: p.id }, select: { matricule: true } })
  if (!i) ignores.push(p.nom + " : inscrit supprime")
  else if (i.matricule === p.ancien) deja += 1
  else if (i.matricule === p.nouveau) aRestaurer.push(p)
  else ignores.push(p.nom + " : matricule modifie depuis (" + i.matricule + ")")
}
console.log("A restaurer : " + aRestaurer.length + " | deja restaures : " + deja + " | ignores : " + ignores.length)
for (const p of aRestaurer.slice(0, 8)) console.log("  [" + p.etab + "] " + p.nouveau + " -> " + p.ancien + "  (" + p.nom + ")")
for (const m of ignores.slice(0, 8)) console.log("  ignore : " + m)
if (appliquer && aRestaurer.length > 0) {
  await db.$transaction(aRestaurer.map((p) => db.inscrit.update({ where: { id: p.id }, data: { matricule: p.ancien } })))
  console.log("RESTAURE : " + aRestaurer.length + " matricule(s).")
} else if (!appliquer) {
  console.log("SIMULATION : rien n'a ete modifie. Relancez avec --appliquer.")
}
await db.$disconnect()