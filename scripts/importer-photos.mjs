import "dotenv/config"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../src/generated/prisma/client.ts"
import { sleep, stats, telecharger, trouver } from "./lib-images.mjs"

// 1) Photo (logo) des etablissements qui n'en ont pas, depuis Wikimedia Commons.
// 2) Avatars illustres (DiceBear, style Lorelei, licence CC0) pour les inscrits, employes et comptes parent / eleve / employe sans photo.
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const credits = []
const cache = new Map()

function requetesEtab(nom) {
  const n = nom.toLowerCase()
  if (/scolaire|école|ecole|lycée|lycee|collège|college/.test(n)) return ["école primaire Côte d'Ivoire", "école Abidjan", "school building Africa", "primary school classroom"]
  if (/cantine|restaurant|services|entreprise/.test(n)) return ["restaurant d'entreprise", "company canteen", "cafeteria interior", "Abidjan Plateau"]
  return ["bâtiment administratif Abidjan", "school building", "Abidjan"]
}

async function avatar(nom) {
  const cle = nom.trim().toLowerCase()
  if (cache.has(cle)) return cache.get(cle)
  const url = "https://api.dicebear.com/9.x/lorelei/png?size=256&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf&seed=" + encodeURIComponent(nom.trim())
  let f = null
  try { f = await telecharger(url, 200 * 1024) } catch { f = null }
  await sleep(120)
  cache.set(cle, f)
  return f
}

const creer = (etablissementId, f) => db.image.create({ data: { etablissementId, mime: f.mime, taille: f.octets.byteLength, donnees: f.octets } })

async function principal() {
  console.log("##### Photos des etablissements")
  const etabs = await db.etablissement.findMany({ where: { logoId: null }, select: { id: true, code: true, name: true } })
  for (const e of etabs) {
    const choix = await trouver(requetesEtab(e.name))
    if (!choix) { console.log("  aucune   " + e.name); continue }
    const img = await creer(e.id, choix.fichier)
    await db.etablissement.update({ where: { id: e.id }, data: { logoId: img.id } })
    credits.push({ etablissement: e.name, fichier: choix.titre, page: choix.page, licence: choix.licence, auteur: choix.auteur })
    console.log("  trouvee  " + e.name + "  <-  " + choix.titre + " (" + choix.licence + ")")
  }

  console.log("##### Avatars")
  const resume = { inscrits: 0, employes: 0, comptes: 0, comptesSansEtablissement: 0, echecs: 0 }
  const inscrits = await db.inscrit.findMany({ where: { imageId: null }, select: { id: true, firstName: true, lastName: true, etablissementId: true } })
  for (const p of inscrits) {
    const f = await avatar(p.firstName + " " + p.lastName)
    if (!f) { resume.echecs++; continue }
    const img = await creer(p.etablissementId, f)
    await db.inscrit.update({ where: { id: p.id }, data: { imageId: img.id } })
    resume.inscrits++
  }
  const employes = await db.employeRh.findMany({ where: { imageId: null }, select: { id: true, firstName: true, lastName: true, etablissementId: true } })
  for (const p of employes) {
    const f = await avatar(p.firstName + " " + p.lastName)
    if (!f) { resume.echecs++; continue }
    const img = await creer(p.etablissementId, f)
    await db.employeRh.update({ where: { id: p.id }, data: { imageId: img.id } })
    resume.employes++
  }
  const comptes = await db.user.findMany({
    where: { imageId: null, role: { in: ["PARENT", "ELEVE", "EMPLOYE"] } },
    select: { id: true, name: true, etablissements: { select: { etablissementId: true }, take: 1 } },
  })
  for (const u of comptes) {
    const etab = u.etablissements[0]?.etablissementId
    if (!etab) { resume.comptesSansEtablissement++; continue }
    const f = await avatar(u.name)
    if (!f) { resume.echecs++; continue }
    const img = await creer(etab, f)
    await db.user.update({ where: { id: u.id }, data: { imageId: img.id } })
    resume.comptes++
  }
  console.log("Avatars : " + JSON.stringify(resume))
  console.log("Recherches Commons : " + JSON.stringify(stats))
  credits.push({ avatars: "DiceBear - style Lorelei (CC0 1.0)", page: "https://www.dicebear.com/styles/lorelei/" })
  const dossier = "C:\\wamp64\\www\\Miam_sauvegardes"
  mkdirSync(dossier, { recursive: true })
  const fichier = join(dossier, "images_credits_photos_" + new Date().toISOString().replace(/[:.]/g, "-") + ".json")
  writeFileSync(fichier, JSON.stringify(credits, null, 2), "utf8")
  console.log("Credits enregistres : " + fichier)
}

principal()
  .catch((e) => { console.log("ERREUR : " + e.message); process.exitCode = 1 })
  .finally(() => db.$disconnect())