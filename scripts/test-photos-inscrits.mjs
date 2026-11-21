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
async function connecter(BASE, email, mdp, menu = true) {
  const p = await (await navigateur.newContext({ locale: "fr-FR", viewport: { width: 1440, height: 2400 } })).newPage()
  p.setDefaultTimeout(30000)
  await p.goto(BASE + "/login", { waitUntil: "load" })
  await p.waitForLoadState("networkidle").catch(() => {})
  await p.locator('input[name="email"]').fill(email)
  await p.locator('input[name="password"]').fill(mdp)
  await p.locator('button[type="submit"]').first().click()
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 })
  if (menu) await p.locator('[data-testid="menu-principal"]').waitFor()
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

const PORT = 3135
const BASE = "http://localhost:" + PORT
const mdpGest = secret()
const mdpP1 = secret()
const mdpP2 = secret()
const GEST = "test-ph-gest@miam.test"
const P1 = "test-ph-parent1@miam.test"
const P2 = "test-ph-parent2@miam.test"
const EMAILS = [GEST, P1, P2]

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: { in: EMAILS } } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-PH", name: "ZZ Cantine Photos", type: "SCHOOL" } })
  await db.user.create({ data: { email: GEST, name: "Test Ph Gest", role: "MANAGER", passwordHash: bcrypt.hashSync(mdpGest, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  await db.user.create({ data: { email: P1, name: "Test Ph Parent Un", role: "PARENT", passwordHash: bcrypt.hashSync(mdpP1, 10), active: true } })
  await db.user.create({ data: { email: P2, name: "Test Ph Parent Deux", role: "PARENT", passwordHash: bcrypt.hashSync(mdpP2, 10), active: true } })
  const eleve = await db.inscrit.create({ data: { etablissementId: E.id, matricule: "ZZ-PH-1", badge: "ZZ-PH-BADGE-1", firstName: "Zz", lastName: "Photo", type: "STUDENT", tuteurs: { create: [{ name: "Parent Un", email: P1 }] } } })
  const employe = await db.inscrit.create({ data: { etablissementId: E.id, matricule: "ZZ-PH-2", badge: "ZZ-PH-BADGE-2", firstName: "Em", lastName: "Ploye", type: "EMPLOYEE" } })

  await demarrer(BASE, PORT)
  const gest = await connecter(BASE, GEST, mdpGest)
  const aller = async (p, chemin, testid) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
  }
  const imageDe = async (id) => (await db.inscrit.findUnique({ where: { id } })).imageId

  await etape("Fiche inscrit (élève et employé) : import réduit, miniature dans la liste, remplacement, fichier refusé, retrait, audit", async () => {
    for (const [ins, nom] of [[eleve, "élève"], [employe, "employé"]]) {
      await aller(gest, "/inscrits/" + ins.id, "fiche-inscrit")
      await gest.locator('[data-testid="photo-input"]').setInputFiles({ name: "p.png", mimeType: "image/png", buffer: png(50, 50, [10, 120, 250]) })
      const premier = await attendre(() => imageDe(ins.id), "photo enregistrée (" + nom + ")")
      const img = await db.image.findUnique({ where: { id: premier } })
      verifier(img.etablissementId === E.id && ["image/webp", "image/jpeg", "image/png"].includes(img.mime) && img.taille > 0 && img.taille <= 716800, "image rattachée à l'établissement (" + nom + ")")
      await aller(gest, "/inscrits", "liste-inscrits")
      await gest.locator('tr[data-matricule="' + ins.matricule + '"] img[src="/api/images/' + premier + '"]').waitFor()
      await aller(gest, "/inscrits/" + ins.id, "fiche-inscrit")
      await gest.locator('[data-testid="photo-input"]').setInputFiles({ name: "p2.png", mimeType: "image/png", buffer: png(64, 64, [250, 10, 120]) })
      await attendre(async () => {
        const id = await imageDe(ins.id)
        return id && id !== premier
      }, "photo remplacée (" + nom + ")")
      verifier((await db.image.findUnique({ where: { id: premier } })) === null, "l'ancienne photo est supprimée (" + nom + ")")
    }
    await aller(gest, "/inscrits/" + eleve.id, "fiche-inscrit")
    await gest.locator('[data-testid="photo-input"]').setInputFiles({ name: "x.png", mimeType: "image/png", buffer: Buffer.from("pas une image") })
    await gest.locator('[data-testid="photo-erreur"]').filter({ hasText: "Image illisible" }).waitFor()
    const courant = await imageDe(eleve.id)
    await gest.getByRole("button", { name: "Retirer la photo" }).click()
    await attendre(async () => (await imageDe(eleve.id)) === null, "photo retirée")
    verifier((await db.image.findUnique({ where: { id: courant } })) === null, "la photo retirée est supprimée de la base")
    verifier((await db.auditLog.count({ where: { userEmail: GEST, action: "INSCRIT_PHOTO" } })) >= 4 && (await db.auditLog.count({ where: { userEmail: GEST, action: "INSCRIT_PHOTO_RETIREE" } })) >= 1, "audit des photos")
  })

  await etape("Parent : importe la photo de son enfant, la voit ; un autre parent et un visiteur n'y ont pas accès", async () => {
    const p1 = await connecter(BASE, P1, mdpP1, false)
    await aller(p1, "/famille/" + eleve.id, "fiche-enfant")
    await p1.locator('[data-testid="photo-input"]').setInputFiles({ name: "e.png", mimeType: "image/png", buffer: png(40, 40, [0, 200, 100]) })
    const id = await attendre(() => imageDe(eleve.id), "photo de l'enfant enregistrée")
    await aller(p1, "/famille/" + eleve.id, "fiche-enfant")
    await p1.locator('[data-testid="photo-apercu"][src="/api/images/' + id + '"]').waitFor()
    verifier((await p1.request.get(BASE + "/api/images/" + id)).status() === 200, "le parent lié voit la photo")
    verifier((await gest.request.get(BASE + "/api/images/" + id)).status() === 200, "le responsable de l'établissement voit la photo")
    const p2 = await connecter(BASE, P2, mdpP2, false)
    verifier((await p2.request.get(BASE + "/api/images/" + id)).status() === 404, "un parent non lié n'y a pas accès")
    verifier((await fetch(BASE + "/api/images/" + id, { redirect: "manual" })).status !== 200, "refusé sans connexion")
    await p2.goto(BASE + "/famille/" + eleve.id, { waitUntil: "load" })
    verifier((await p2.locator('[data-testid="photo-input"]').count()) === 0, "un parent non lié ne peut pas modifier la photo")
  })
}

principal()
  .then(() => terminer(nettoyer, "PHOTOS INSCRITS", 0))
  .catch((e) => {
    console.log("ERREUR : " + e.message)
    return terminer(nettoyer, "PHOTOS INSCRITS", 1)
  })