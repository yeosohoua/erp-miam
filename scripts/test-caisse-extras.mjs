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
  const p = await (await navigateur.newContext({ locale: "fr-FR", viewport: { width: 1440, height: 2200 } })).newPage()
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

const PORT = 3131
const BASE = "http://localhost:" + PORT
const mdpGest = secret()
const mdpCais = secret()
const GEST = "test-ce-gest@miam.test"
const CAIS = "test-ce-cais@miam.test"
const EMAILS = [GEST, CAIS]

async function nettoyer() {
  const us = await db.user.findMany({ where: { email: { in: EMAILS } }, select: { imageId: true } })
  const ids = us.map((u) => u.imageId).filter((x) => x)
  await db.auditLog.deleteMany({ where: { userEmail: { in: EMAILS } } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  if (ids.length) await db.image.deleteMany({ where: { id: { in: ids } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-CE", name: "ZZ Cantine Extras", type: "SCHOOL", prepaye: true } })
  const creerUser = (email, name, role, mdp) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  await creerUser(GEST, "Test Ce Gest", "MANAGER", mdpGest)
  await creerUser(CAIS, "Test Ce Cais", "CASHIER", mdpCais)
  await db.articleCarte.create({ data: { etablissementId: E.id, nom: "ZZ Jus", prix: 500, categorie: "Boissons" } })
  await db.articleCarte.create({ data: { etablissementId: E.id, nom: "ZZ Pain", prix: 250, categorie: "Snacks" } })

  await demarrer(BASE, PORT)
  const gest = await connecter(BASE, GEST, mdpGest)
  const cais = await connecter(BASE, CAIS, mdpCais)
  const aller = async (p, chemin, testid) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
  }
  const article = (p, nom) => p.locator('[data-article="' + nom + '"]:visible')
  const imageGest = async () => (await db.user.findUnique({ where: { email: GEST } })).imageId

  await etape("Photo de profil : import réduit, affichée dans le menu, visible des collègues seulement connectés, remplacement et retrait", async () => {
    await aller(gest, "/compte", "avatar-input")
    await gest.locator('[data-testid="avatar-input"]').setInputFiles({ name: "moi.png", mimeType: "image/png", buffer: png(40, 40, [0, 120, 255]) })
    const premier = await attendre(imageGest, "photo enregistrée")
    const img = await db.image.findUnique({ where: { id: premier } })
    verifier(img.etablissementId === null && ["image/webp", "image/jpeg"].includes(img.mime) && img.taille > 0 && img.taille <= 716800, "image réduite et stockée sans établissement")
    await aller(gest, "/compte", "avatar-input")
    await gest.locator('[data-testid="avatar-menu"]').waitFor()
    const src = await gest.locator('[data-testid="avatar-menu"]').getAttribute("src")
    verifier(src === "/api/images/" + premier, "le menu affiche la photo")
    const rep = await cais.request.get(BASE + src)
    verifier(rep.status() === 200 && /^image\/(webp|jpeg)$/.test(rep.headers()["content-type"]), "un collègue connecté voit la photo")
    verifier((await fetch(BASE + src, { redirect: "manual" })).status !== 200, "refusée sans connexion")

    await gest.locator('[data-testid="avatar-input"]').setInputFiles({ name: "moi2.png", mimeType: "image/png", buffer: png(64, 64, [255, 0, 120]) })
    await attendre(async () => {
      const id = await imageGest()
      return id && id !== premier
    }, "photo remplacée")
    verifier((await db.image.findUnique({ where: { id: premier } })) === null, "l'ancienne photo est supprimée")

    await aller(gest, "/compte", "avatar-input")
    await gest.locator('[data-testid="avatar-input"]').setInputFiles({ name: "x.png", mimeType: "image/png", buffer: Buffer.from("pas une image") })
    await gest.locator('[data-testid="avatar-erreur"]').filter({ hasText: "Image illisible" }).waitFor()
    const courant = await imageGest()
    await gest.getByRole("button", { name: "Retirer la photo" }).click()
    await attendre(async () => (await imageGest()) === null, "photo retirée")
    verifier((await db.image.findUnique({ where: { id: courant } })) === null, "la photo retirée est supprimée de la base")
    const compte = (action) => db.auditLog.count({ where: { userEmail: GEST, action } })
    verifier((await compte("AVATAR_MIS_A_JOUR")) >= 2 && (await compte("AVATAR_RETIRE")) >= 1, "audit des changements de photo")
  })

  await etape("Remises : réservées au gestionnaire, total net enregistré, visibles sur le reçu et le ticket, 100 % refusé", async () => {
    await aller(cais, "/caisse", "caisse-page")
    verifier((await cais.locator("#ca-remise").count()) === 0, "le caissier n'a pas de champ de remise")
    await aller(gest, "/caisse", "caisse-page")
    await article(gest, "ZZ Jus").click()
    await article(gest, "ZZ Jus").click()
    await gest.locator("#ca-remise").fill("10")
    await gest.locator('[data-mode="CASH"]:visible').click()
    await gest.locator("#ca-recu").fill("1000")
    verifier((await gest.locator('[data-testid="panier-total"]').getAttribute("data-valeur")) === "900", "total net 900")
    await gest.locator('[data-testid="remise-apercu"][data-valeur="100"]').waitFor()
    await gest.locator('[data-testid="rendu-apercu"][data-valeur="100"]').waitFor()
    await gest.getByRole("button", { name: "Encaisser" }).click()
    await gest.locator('[data-testid="caisse-resultat"][data-numero="1"]').waitFor()
    const recu = gest.locator('[data-testid="recu-imprimante"][data-ticket="T-00001"]')
    await recu.waitFor()
    verifier((await recu.locator('[data-recu-remise="100"]').count()) === 1 && (await recu.locator('[data-recu-total="900"]').count()) === 1, "remise 100 et total 900 sur le reçu")
    const v = await db.venteComptoir.findFirst({ where: { etablissementId: E.id, numero: 1 }, include: { lignes: true } })
    verifier(v.total === 900 && v.remise === 100 && v.recu === 1000, "vente enregistrée au total net avec sa remise")
    verifier(v.lignes.reduce((s, l) => s + l.montant, 0) === 1000, "les lignes gardent le prix catalogue")
    const ticket = await gest.request.get(BASE + "/impression-ticket/1")
    verifier((await ticket.text()).includes('data-remise="100"'), "la remise figure sur le ticket imprimé")

    await article(gest, "ZZ Pain").click()
    await gest.locator("#ca-remise").fill("150")
    await gest.getByRole("button", { name: "Encaisser" }).click()
    await gest.locator('[data-testid="caisse-erreur"]:visible').filter({ hasText: "Montant invalide" }).waitFor()
    verifier((await db.venteComptoir.count({ where: { etablissementId: E.id } })) === 1, "une remise de 100 % ne crée pas de vente")
  })
}

principal()
  .then(() => terminer(nettoyer, "CAISSE EXTRAS", 0))
  .catch((e) => {
    console.log("ERREUR : " + e.message)
    return terminer(nettoyer, "CAISSE EXTRAS", 1)
  })