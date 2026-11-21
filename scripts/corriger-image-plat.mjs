import "dotenv/config"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../src/generated/prisma/client.ts"

// Remplace l'image d'un plat (et celle des menus qui l'avaient copiee) par une photo libre de droits de Wikimedia Commons.
// Usage : npx tsx scripts\corriger-image-plat.mjs --plat "Nom exact" --requete "mots cles" [--appliquer]
const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null }
const NOM = arg("--plat")
const REQUETE = arg("--requete")
const APPLIQUER = process.argv.includes("--appliquer")
if (!NOM || !REQUETE) { console.log("Usage : --plat \"Nom exact\" --requete \"mots cles\" [--appliquer]"); process.exit(1) }

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const LIMITE = 700 * 1024
const UA = "MiamERP/1.0 (demo canteen ERP; local development)"
const LICENCES = /^(cc0|public domain|pd|cc by(-sa)? \d)/i
const nettoyer = (s) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()

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
    if ((ii.width ?? 0) < 400 || (ii.height ?? 0) < 300) continue
    const meta = ii.extmetadata ?? {}
    const licence = nettoyer(meta.LicenseShortName?.value)
    if (!LICENCES.test(licence)) continue
    bons.push({ titre: nettoyer(p.title), miniature: ii.thumburl, page: ii.descriptionurl, licence, auteur: nettoyer(meta.Artist?.value).slice(0, 120), index: p.index ?? 99 })
  }
  return bons.sort((a, b) => a.index - b.index)
}

async function telecharger(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } })
  if (!r.ok) return null
  const octets = new Uint8Array(await r.arrayBuffer())
  if (octets.byteLength === 0 || octets.byteLength > LIMITE) return null
  const h = (...o) => o.every((v, i) => octets[i] === v)
  const mime = h(0xff, 0xd8, 0xff) ? "image/jpeg" : h(0x89, 0x50, 0x4e, 0x47) ? "image/png" : h(0x52, 0x49, 0x46, 0x46) ? "image/webp" : null
  return mime ? { octets, mime } : null
}

async function principal() {
  const plats = await db.plat.findMany({ where: { name: { equals: NOM, mode: "insensitive" } }, select: { id: true, name: true, etablissementId: true, imageId: true } })
  if (plats.length === 0) { console.log("Aucun plat nomme : " + NOM); return }
  let choix = null
  for (const cand of await chercher(REQUETE)) {
    const f = await telecharger(cand.miniature)
    await sleep(350)
    if (f) { choix = { ...cand, fichier: f }; break }
  }
  if (!choix) { console.log("Aucune image libre trouvee pour : " + REQUETE); return }
  console.log((APPLIQUER ? "APPLICATION" : "SIMULATION") + " : " + plats.length + " plat(s) '" + NOM + "' <- " + choix.titre + " (" + choix.licence + ")")

  const anciennes = []
  for (const p of plats) {
    if (!p.imageId) continue
    const im = await db.image.findUnique({ where: { id: p.imageId }, select: { id: true, taille: true, donnees: true } })
    if (im) anciennes.push(im)
  }
  const tailles = [...new Set(anciennes.map((a) => a.taille))]
  const candidats = tailles.length === 0 ? [] : await db.menu.findMany({ where: { image: { taille: { in: tailles } } }, select: { id: true, etablissementId: true, image: { select: { id: true, donnees: true } } } })
  const menus = candidats.filter((m) => m.image && anciennes.some((a) => Buffer.from(a.donnees).equals(Buffer.from(m.image.donnees))))
  console.log("Menus qui avaient copie l'ancienne image : " + menus.length)
  if (!APPLIQUER) return

  const aSupprimer = new Set(anciennes.map((a) => a.id))
  for (const p of plats) {
    const img = await db.image.create({ data: { etablissementId: p.etablissementId, mime: choix.fichier.mime, taille: choix.fichier.octets.byteLength, donnees: choix.fichier.octets } })
    await db.plat.update({ where: { id: p.id }, data: { imageId: img.id } })
  }
  for (const m of menus) {
    const img = await db.image.create({ data: { etablissementId: m.etablissementId, mime: choix.fichier.mime, taille: choix.fichier.octets.byteLength, donnees: choix.fichier.octets } })
    await db.menu.update({ where: { id: m.id }, data: { imageId: img.id } })
    aSupprimer.add(m.image.id)
  }
  await db.image.deleteMany({ where: { id: { in: [...aSupprimer] } } })
  const dossier = "C:\\wamp64\\www\\Miam_sauvegardes"
  mkdirSync(dossier, { recursive: true })
  const fichier = join(dossier, "images_credits_correction_" + new Date().toISOString().replace(/[:.]/g, "-") + ".json")
  writeFileSync(fichier, JSON.stringify([{ plat: NOM, fichier: choix.titre, page: choix.page, licence: choix.licence, auteur: choix.auteur }], null, 2), "utf8")
  console.log("Remplace. Anciennes images supprimees : " + aSupprimer.size + ". Credits : " + fichier)
}

principal()
  .catch((e) => { console.log("ERREUR : " + e.message); process.exitCode = 1 })
  .finally(() => db.$disconnect())