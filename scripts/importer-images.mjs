import "dotenv/config"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../src/generated/prisma/client.ts"

// Importe des photos libres de droits (Wikimedia Commons) pour les plats sans image.
// Simulation par defaut ; --appliquer ecrit en base. Les credits sont enregistres dans Miam_sauvegardes.
const APPLIQUER = process.argv.includes("--appliquer")
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const LIMITE = 700 * 1024
const UA = "MiamERP/1.0 (demo canteen ERP; local development)"
const LICENCES = /^(cc0|public domain|pd|cc by(-sa)? \d)/i
const credits = []

const SYNONYMES = [
  [/alloco/i, ["alloco banane plantain frite", "alloco", "fried plantain"]],
  [/ananas/i, ["ananas fruit", "pineapple slices", "pineapple"]],
  [/garba/i, ["garba attiéké thon", "attiéké poisson frit", "attiéké"]],
  [/k[ée]djenou/i, ["kedjenou", "kédjénou poulet", "chicken stew"]],
  [/orange/i, ["orange fruit", "oranges", "orange (fruit)"]],
  [/placali/i, ["placali", "pâte de manioc", "cassava dough food"]],
  [/riz gras/i, ["riz gras", "jollof rice", "riz au gras"]],
  [/arachide/i, ["maafe", "mafé", "peanut stew rice", "riz sauce arachide"]],
  [/graine/i, ["sauce graine", "palm nut soup", "sauce graine palme"]],
  [/feuille/i, ["sauce feuille", "cassava leaves stew", "sauce feuilles manioc"]],
  [/spaghetti/i, ["spaghetti bolognese", "spaghetti bolognaise", "spaghetti"]],
  [/haricot/i, ["haricots huile de palme plantain", "haricots rouges", "beans and plantain"]],
  [/gombo/i, ["sauce gombo", "okra stew", "gombo"]],
  [/banane/i, ["banane douce", "banana", "plantain"]],
  [/atti[ée]k[ée]/i, ["attiéké poisson braisé", "attiéké", "attieke"]],
  [/foutou/i, ["foutou banane", "fufu", "foutou"]],
]

const nettoyer = (s) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
const stats = { resultats: 0, licenceRefusee: 0, tropPetite: 0, telechargementRefuse: 0 }

function variantes(nom) {
  const q = [nom]
  for (const [rx, liste] of SYNONYMES) if (rx.test(nom)) q.push(...liste)
  const sans = nom.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim()
  q.push(nom, sans)
  const mots = sans.split(" ").filter((m) => m.length > 2 && !["et", "de", "du", "des", "aux", "au"].includes(m.toLowerCase()))
  if (mots.length > 2) q.push(mots.slice(0, 2).join(" "))
  if (mots.length > 0 && mots[0].length > 4) q.push(mots[0])
  return [...new Set(q)]
}

async function chercher(requete) {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=12&format=json&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=640&gsrsearch=" +
    encodeURIComponent(requete + " filetype:bitmap")
  const r = await fetch(url, { headers: { "User-Agent": UA } })
  if (!r.ok) return []
  const data = await r.json()
  const pages = Object.values(data?.query?.pages ?? {})
  const bons = []
  for (const p of pages) {
    const ii = p.imageinfo?.[0]
    if (!ii || !/^image\/(jpeg|png|webp)$/.test(ii.mime ?? "")) continue
    stats.resultats++
    if ((ii.width ?? 0) < 400 || (ii.height ?? 0) < 300) { stats.tropPetite++; continue }
    const meta = ii.extmetadata ?? {}
    const licence = nettoyer(meta.LicenseShortName?.value)
    if (!LICENCES.test(licence)) { stats.licenceRefusee++; continue }
    bons.push({ titre: nettoyer(p.title), miniature: ii.thumburl, page: ii.descriptionurl, licence, auteur: nettoyer(meta.Artist?.value).slice(0, 120), index: p.index ?? 99 })
  }
  return bons.sort((a, b) => a.index - b.index)
}

async function telecharger(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } })
  if (!r.ok) { stats.telechargementRefuse++; return null }
  const octets = new Uint8Array(await r.arrayBuffer())
  if (octets.byteLength === 0 || octets.byteLength > LIMITE) { stats.telechargementRefuse++; return null }
  const h = (...o) => o.every((v, i) => octets[i] === v)
  const mime = h(0xff, 0xd8, 0xff) ? "image/jpeg" : h(0x89, 0x50, 0x4e, 0x47) ? "image/png" : h(0x52, 0x49, 0x46, 0x46) ? "image/webp" : null
  if (!mime) stats.telechargementRefuse++
  return mime ? { octets, mime } : null
}

async function principal() {
  const plats = await db.plat.findMany({ where: { imageId: null }, select: { id: true, name: true, etablissementId: true }, orderBy: { name: "asc" } })
  const noms = [...new Set(plats.map((p) => p.name.toLowerCase()))]
  console.log((APPLIQUER ? "APPLICATION" : "SIMULATION") + " : " + plats.length + " plat(s) sans image, " + noms.length + " nom(s) distinct(s)")
  const choisis = new Map()
  for (const nom of noms) {
    const original = plats.find((p) => p.name.toLowerCase() === nom).name
    let choix = null
    for (const q of variantes(original)) {
      const c = await chercher(q)
      await sleep(350)
      for (const cand of c) {
        const f = await telecharger(cand.miniature)
        await sleep(350)
        if (f) { choix = { ...cand, fichier: f, requete: q }; break }
      }
      if (choix) break
    }
    choisis.set(nom, choix)
    console.log(choix ? "  trouvee  " + original + "  <-  " + choix.titre + " (" + choix.licence + ", requete : " + choix.requete + ")" : "  aucune   " + original)
  }
  let trouves = 0
  for (const p of plats) {
    const choix = choisis.get(p.name.toLowerCase())
    if (!choix) continue
    trouves++
    credits.push({ plat: p.name, fichier: choix.titre, page: choix.page, licence: choix.licence, auteur: choix.auteur })
    if (APPLIQUER) {
      const img = await db.image.create({ data: { etablissementId: p.etablissementId, mime: choix.fichier.mime, taille: choix.fichier.octets.byteLength, donnees: choix.fichier.octets } })
      await db.plat.update({ where: { id: p.id }, data: { imageId: img.id } })
    }
  }

  const menus = await db.menu.findMany({ where: { imageId: null }, select: { id: true, etablissementId: true, plats: { select: { plat: { select: { imageId: true } } } } } })
  let menusIllustres = 0
  for (const m of menus) {
    const source = m.plats.map((x) => x.plat.imageId).find(Boolean)
    if (!source) continue
    menusIllustres++
    if (APPLIQUER) {
      const src = await db.image.findUnique({ where: { id: source }, select: { mime: true, taille: true, donnees: true } })
      if (!src) continue
      const copie = await db.image.create({ data: { etablissementId: m.etablissementId, mime: src.mime, taille: src.taille, donnees: src.donnees } })
      await db.menu.update({ where: { id: m.id }, data: { imageId: copie.id } })
    }
  }
  console.log("Noms illustres : " + [...choisis.values()].filter(Boolean).length + " / " + noms.length + "  (plats : " + trouves + " / " + plats.length + ")")
  console.log("Detail des recherches : " + JSON.stringify(stats))
  console.log("Menus sans image : " + menus.length + (APPLIQUER ? ", illustres : " + menusIllustres : " (ils reprendront l'image de leur premier plat apres l'import)"))
  if (APPLIQUER && credits.length > 0) {
    const dossier = "C:\\wamp64\\www\\Miam_sauvegardes"
    mkdirSync(dossier, { recursive: true })
    const fichier = join(dossier, "images_credits_" + new Date().toISOString().replace(/[:.]/g, "-") + ".json")
    writeFileSync(fichier, JSON.stringify(credits, null, 2), "utf8")
    console.log("Credits enregistres : " + fichier)
  }
}

principal()
  .catch((e) => { console.log("ERREUR : " + e.message); process.exitCode = 1 })
  .finally(() => db.$disconnect())