import "dotenv/config"
import { randomBytes } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"
import { deflateSync } from "node:zlib"

import { PrismaPg } from "@prisma/adapter-pg"
import * as bcryptModule from "bcryptjs"
import Redis from "ioredis"
import { chromium } from "playwright"

import { PrismaClient } from "../src/generated/prisma/client.ts"

const bcrypt = bcryptModule.default ?? bcryptModule
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const redis = new Redis(process.env.REDIS_URL)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const secret = () => randomBytes(8).toString("hex") + "Zz9"
let serveur = null
let navigateur = null
const resultats = []

function verifier(condition, message) {
  if (!condition) throw new Error(message)
}
async function attendre(fn, message, delai = 30000) {
  const fin = Date.now() + delai
  while (Date.now() < fin) {
    const v = await fn()
    if (v) return v
    await sleep(300)
  }
  throw new Error("Delai depasse : " + message)
}
async function etape(nom, fn) {
  try {
    await fn()
    resultats.push({ nom, ok: true })
    console.log("  OK     " + nom)
  } catch (e) {
    resultats.push({ nom, ok: false })
    console.log("  ECHEC  " + nom + " -> " + e.message)
    throw e
  }
}
async function connecter(BASE, email, mdp) {
  const p = await (await navigateur.newContext({ locale: "fr-FR", viewport: { width: 1440, height: 2400 } })).newPage()
  p.setDefaultTimeout(30000)
  await p.goto(BASE + "/login", { waitUntil: "load" })
  await p.waitForLoadState("networkidle").catch(() => {})
  await p.locator('input[name="email"]').fill(email)
  await p.locator('input[name="password"]').fill(mdp)
  await p.locator('button[type="submit"]').first().click()
  await p.waitForURL((u) => u.pathname === "/", { timeout: 30000 })
  await p.locator('[data-testid="menu-principal"]').waitFor()
  return p
}
async function demarrer(BASE, PORT) {
  serveur = spawn("npx", ["next", "start", "-p", String(PORT)], { shell: true, cwd: process.cwd(), env: process.env, stdio: "ignore" })
  await attendre(async () => {
    try {
      return (await fetch(BASE + "/api/sante")).ok
    } catch {
      return false
    }
  }, "demarrage du serveur", 60000)
  navigateur = await chromium.launch()
}
async function terminer(nettoyer, nom, code) {
  if (navigateur) await navigateur.close().catch(() => {})
  if (serveur) {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(serveur.pid), "/T", "/F"])
    else serveur.kill()
  }
  await nettoyer().catch((e) => console.log("Nettoyage incomplet : " + e.message))
  await db.$disconnect().catch(() => {})
  redis.disconnect()
  const reussies = resultats.filter((r) => r.ok).length
  console.log("")
  console.log("Resultat : " + reussies + " / " + resultats.length + " etapes reussies")
  console.log(code === 0 ? "=== TESTS " + nom + " OK ===" : "=== TESTS " + nom + " ECHEC ===")
  process.exit(code)
}

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}
function morceau(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const t = Buffer.from(type, "ascii")
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, c])
}
function png(w, h, rgb) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const ligne = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())])
  const brut = Buffer.concat(Array.from({ length: h }, () => ligne))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), morceau("IHDR", ihdr), morceau("IDAT", deflateSync(brut)), morceau("IEND", Buffer.alloc(0))])
}

const PORT = 3137
const BASE = "http://localhost:" + PORT
const mdp = secret()
const GEST = "test-ip-gest@miam.test"

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: GEST } })
  await db.user.deleteMany({ where: { email: GEST } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  await redis.del("rl:fail:" + GEST, "rl:blk:" + GEST)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-IP", name: "ZZ Cantine Images Plats", type: "SCHOOL" } })
  await db.user.create({ data: { email: GEST, name: "Test Ip Gest", role: "MANAGER", passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  const plat = await db.plat.create({ data: { etablissementId: E.id, name: "ZZ Riz sauce", portions: 4 } })

  await demarrer(BASE, PORT)
  const gest = await connecter(BASE, GEST, mdp)
  const imageDe = async () => (await db.plat.findUnique({ where: { id: plat.id } })).imageId

  await etape("Plat : image importée (réduite, rattachée à l'établissement), miniature dans la liste, remplacement, fichier refusé, retrait", async () => {
    await gest.goto(BASE + "/menus/plats/" + plat.id, { waitUntil: "load" })
    await gest.waitForLoadState("networkidle").catch(() => {})
    await gest.locator('[data-testid="photo-input"]').waitFor()
    await gest.locator('[data-testid="photo-input"]').setInputFiles({ name: "a.png", mimeType: "image/png", buffer: png(120, 40, [200, 90, 20]) })
    const premier = await attendre(imageDe, "image enregistrée")
    const img = await db.image.findUnique({ where: { id: premier } })
    verifier(img.etablissementId === E.id && img.taille > 0 && img.taille <= 716800, "image rattachée à l'établissement")
    await gest.goto(BASE + "/menus/plats", { waitUntil: "load" })
    await gest.waitForLoadState("networkidle").catch(() => {})
    await gest.locator('tr[data-plat="ZZ Riz sauce"] img[src="/api/images/' + premier + '"]').waitFor()
    await gest.goto(BASE + "/menus/plats/" + plat.id, { waitUntil: "load" })
    await gest.waitForLoadState("networkidle").catch(() => {})
    await gest.locator('[data-testid="photo-apercu"][src="/api/images/' + premier + '"]').waitFor()
    const classe = await gest.locator('[data-testid="photo-apercu"]').getAttribute("class")
    verifier(classe.includes("object-contain") && !classe.includes("object-cover"), "image affichée en entier (object-contain)")
    await gest.locator('[data-testid="photo-input"]').setInputFiles({ name: "b.png", mimeType: "image/png", buffer: png(60, 60, [10, 90, 200]) })
    await attendre(async () => {
      const id = await imageDe()
      return id && id !== premier
    }, "image remplacée")
    verifier((await db.image.findUnique({ where: { id: premier } })) === null, "l'ancienne image est supprimée")
    await gest.locator('[data-testid="photo-input"]').setInputFiles({ name: "x.png", mimeType: "image/png", buffer: Buffer.from("pas une image") })
    await gest.locator('[data-testid="photo-erreur"]').filter({ hasText: "Image illisible" }).waitFor()
    const courant = await imageDe()
    await gest.getByRole("button", { name: "Retirer l'image" }).click()
    await attendre(async () => (await imageDe()) === null, "image retirée")
    verifier((await db.image.findUnique({ where: { id: courant } })) === null, "l'image retirée est supprimée de la base")
    verifier((await db.auditLog.count({ where: { userEmail: GEST, action: "PLAT_IMAGE" } })) >= 2 && (await db.auditLog.count({ where: { userEmail: GEST, action: "PLAT_IMAGE_RETIREE" } })) >= 1, "audit des images de plat")
  })
}

principal()
  .then(() => terminer(nettoyer, "IMAGES PLATS", 0))
  .catch((e) => {
    console.log("ERREUR : " + e.message)
    return terminer(nettoyer, "IMAGES PLATS", 1)
  })