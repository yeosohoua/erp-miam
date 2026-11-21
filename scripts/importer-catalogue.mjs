import "dotenv/config"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../src/generated/prisma/client.ts"

// Cree les categories d'articles manquantes et importe des photos libres de droits (Wikimedia Commons)
// pour les articles de la caisse et les categories sans image. Simulation par defaut ; --appliquer ecrit en base.
const APPLIQUER = process.argv.includes("--appliquer")
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const LIMITE = 700 * 1024
const UA = "MiamERP/1.0 (demo canteen ERP; local development)"
const LICENCES = /^(cc0|public domain|pd|cc by(-sa)? \d)/i
const STANDARD = ["Boissons", "Plats chauds", "Snacks", "Desserts", "Fruits", "Pâtisseries", "Petit-déjeuner"]
const credits = []
const stats = { resultats: 0, licenceRefusee: 0, tropPetite: 0, telechargementRefuse: 0 }

const ARTICLES = [
  [/eau/i, ["bouteille eau minérale", "mineral water bottle", "bottled water"]],
  [/bissap/i, ["bissap hibiscus", "jus de bissap", "hibiscus drink", "hibiscus tea"]],
  [/gingembre/i, ["jus de gingembre", "ginger juice", "ginger drink"]],
  [/yaourt/i, ["yaourt nature", "plain yogurt bowl", "yogurt"]],
  [/beignet/i, ["beignets", "beignets africains", "doughnuts", "fried dough balls"]],
  [/biscuit/i, ["biscuits", "cookies", "shortbread biscuits"]],
  [/pain.?omelette/i, ["omelette sandwich", "egg sandwich", "pain omelette"]],
  [/sandwich/i, ["chicken sandwich", "sandwich poulet", "sandwich"]],
]
const CATEGORIES = {
  Boissons: ["boissons fraîches", "cold drinks glasses", "fruit juice glasses"],
  "Plats chauds": ["plat africain riz sauce", "hot meal rice stew", "kedjenou"],
  Snacks: ["snacks", "street food snacks", "beignets"],
  Desserts: ["desserts", "dessert plate", "fruit salad dessert"],
  Fruits: ["fruits tropicaux", "tropical fruits", "fruit basket"],
  "Pâtisseries": ["pâtisseries", "pastries", "croissants"],
  "Petit-déjeuner": ["petit-déjeuner", "breakfast bread coffee", "breakfast table"],
}

const nettoyer = (s) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()

function variantes(nom, synonymes) {
  const q = [...synonymes, nom]
  const sans = nom.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim()
  q.push(sans)
  const mots = sans.split(" ").filter((m) => m.length > 2)
  if (mots.length > 2) q.push(mots.slice(0, 2).join(" "))
  return [...new Set(q)]
}

async function chercher(requete) {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=12&format=json&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=640&gsrsearch=" +
    encodeURIComponent(requete + " filetype:bitmap")
  const r = await fetch(url, { headers: { "User-Agent": UA } })
  if (!r.ok) return []
  const data = await r.json()
  const bons = []
  for (const p of Object.values(data?.query?.pages ?? {})) {
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

async function trouver(nom, synonymes) {
  for (const q of variantes(nom, synonymes)) {
    const c = await chercher(q)
    await sleep(350)
    for (const cand of c) {
      const f = await telecharger(cand.miniature)
      await sleep(350)
      if (f) return { ...cand, fichier: f, requete: q }
    }
  }
  return null
}

async function creerImage(etablissementId, f) {
  return db.image.create({ data: { etablissementId, mime: f.mime, taille: f.octets.byteLength, donnees: f.octets } })
}

async function principal() {
  console.log(APPLIQUER ? "APPLICATION" : "SIMULATION")
  const etabs = await db.etablissement.findMany({ select: { id: true, code: true } })

  console.log("##### Categories")
  for (const e of etabs) {
    const arts = await db.articleCarte.findMany({ where: { etablissementId: e.id, categorie: { not: null } }, select: { categorie: true } })
    const existantes = await db.categorieArticle.findMany({ where: { etablissementId: e.id }, select: { nom: true, ordre: true } })
    const connus = new Set(existantes.map((c) => c.nom))
    const voulus = [...new Set([...STANDARD, ...arts.map((a) => a.categorie)])]
    const aCreer = voulus.filter((n) => !connus.has(n))
    let ordre = Math.max(0, ...existantes.map((c) => c.ordre))
    console.log("  " + e.code + " : " + existantes.length + " existante(s), " + aCreer.length + " a creer" + (aCreer.length ? " (" + aCreer.join(", ") + ")" : ""))
    if (APPLIQUER && aCreer.length > 0) {
      await db.categorieArticle.createMany({ data: aCreer.map((nom) => ({ etablissementId: e.id, nom, ordre: ++ordre })), skipDuplicates: true })
    }
  }

  console.log("##### Articles de la caisse")
  const articles = await db.articleCarte.findMany({ where: { imageId: null }, select: { id: true, nom: true, etablissementId: true }, orderBy: { nom: "asc" } })
  const parNom = new Map()
  for (const a of articles) {
    const cle = a.nom.toLowerCase()
    if (parNom.has(cle)) continue
    const voisin = await db.articleCarte.findFirst({ where: { nom: a.nom, imageId: { not: null } }, select: { image: { select: { mime: true, donnees: true } } } })
    if (voisin?.image) {
      parNom.set(cle, { fichier: { mime: voisin.image.mime, octets: new Uint8Array(voisin.image.donnees) }, titre: "(image d'un article identique)", licence: "-", page: "", auteur: "" })
      console.log("  reutilisee  " + a.nom)
      continue
    }
    const syn = ARTICLES.find(([rx]) => rx.test(a.nom))?.[1] ?? []
    const choix = await trouver(a.nom, syn)
    parNom.set(cle, choix)
    console.log(choix ? "  trouvee     " + a.nom + "  <-  " + choix.titre + " (" + choix.licence + ")" : "  aucune      " + a.nom)
  }
  let artIllustres = 0
  for (const a of articles) {
    const choix = parNom.get(a.nom.toLowerCase())
    if (!choix) continue
    artIllustres++
    credits.push({ article: a.nom, fichier: choix.titre, page: choix.page, licence: choix.licence, auteur: choix.auteur })
    if (APPLIQUER) {
      const img = await creerImage(a.etablissementId, choix.fichier)
      await db.articleCarte.update({ where: { id: a.id }, data: { imageId: img.id } })
    }
  }

  console.log("##### Categories : images")
  const cats = await db.categorieArticle.findMany({ where: { imageId: null }, select: { id: true, nom: true, etablissementId: true } })
  const nomsCats = [...new Set([...cats.map((c) => c.nom), ...(APPLIQUER ? [] : STANDARD)])]
  const choixCat = new Map()
  for (const nom of nomsCats) {
    const choix = await trouver(nom, CATEGORIES[nom] ?? [])
    choixCat.set(nom, choix)
    console.log(choix ? "  trouvee     " + nom + "  <-  " + choix.titre + " (" + choix.licence + ")" : "  aucune      " + nom)
  }
  let catIllustrees = 0
  for (const c of cats) {
    const choix = choixCat.get(c.nom)
    if (!choix) continue
    catIllustrees++
    credits.push({ categorie: c.nom, fichier: choix.titre, page: choix.page, licence: choix.licence, auteur: choix.auteur })
    if (APPLIQUER) {
      const img = await creerImage(c.etablissementId, choix.fichier)
      await db.categorieArticle.update({ where: { id: c.id }, data: { imageId: img.id } })
    }
  }

  console.log("Articles illustres : " + artIllustres + " / " + articles.length + " ; categories illustrees : " + catIllustrees + " / " + cats.length)
  console.log("Detail des recherches : " + JSON.stringify(stats))
  if (APPLIQUER && credits.length > 0) {
    const dossier = "C:\\wamp64\\www\\Miam_sauvegardes"
    mkdirSync(dossier, { recursive: true })
    const fichier = join(dossier, "images_credits_catalogue_" + new Date().toISOString().replace(/[:.]/g, "-") + ".json")
    writeFileSync(fichier, JSON.stringify(credits, null, 2), "utf8")
    console.log("Credits enregistres : " + fichier)
  }
}

principal()
  .catch((e) => { console.log("ERREUR : " + e.message); process.exitCode = 1 })
  .finally(() => db.$disconnect())