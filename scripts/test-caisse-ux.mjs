import "dotenv/config"
import { randomBytes } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"

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

const PORT = 3139
const BASE = "http://localhost:" + PORT
const mdp = secret()
const CAIS = "test-ux-cais@miam.test"

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: CAIS } })
  await db.user.deleteMany({ where: { email: CAIS } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  await redis.del("rl:fail:" + CAIS, "rl:blk:" + CAIS)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-UX", name: "ZZ Cantine UX", type: "SCHOOL", prepaye: true } })
  await db.user.create({ data: { email: CAIS, name: "Test Ux Cais", role: "CASHIER", passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  const img = await db.image.create({ data: { etablissementId: E.id, mime: "image/png", taille: 8, donnees: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) } })
  await db.articleCarte.create({ data: { etablissementId: E.id, nom: "ZZ Jus", prix: 500, categorie: "Boissons", imageId: img.id } })
  await db.articleCarte.create({ data: { etablissementId: E.id, nom: "ZZ Biscuit", prix: 150, categorie: "Snacks" } })

  await demarrer(BASE, PORT)
  const ctx = await navigateur.newContext({ locale: "fr-FR", viewport: { width: 1440, height: 2400 } })
  // Compte les sons produits : oscillateurs (bips) et sources de bruit (clics d'imprimante).
  await ctx.addInitScript(() => {
    window.__osc = 0
    window.__bruit = 0
    const A = window.AudioContext
    if (A) {
      const o = A.prototype.createOscillator
      A.prototype.createOscillator = function () {
        window.__osc += 1
        return o.apply(this, arguments)
      }
      const b = A.prototype.createBufferSource
      A.prototype.createBufferSource = function () {
        window.__bruit += 1
        return b.apply(this, arguments)
      }
    }
  })
  const p = await ctx.newPage()
  p.setDefaultTimeout(30000)
  await p.goto(BASE + "/login", { waitUntil: "load" })
  await p.waitForLoadState("networkidle").catch(() => {})
  await p.locator('input[name="email"]').fill(CAIS)
  await p.locator('input[name="password"]').fill(mdp)
  await p.locator('button[type="submit"]').first().click()
  await p.waitForURL((u) => u.pathname === "/", { timeout: 30000 })
  await p.goto(BASE + "/caisse", { waitUntil: "load" })
  await p.waitForLoadState("networkidle").catch(() => {})
  await p.locator('[data-testid="caisse-page"]:visible').waitFor()
  const compte = (nom) => p.evaluate((k) => window[k], nom)

  await etape("Cartes façon boutique : prix en pastille, nom et catégorie, image entière, sans bouton Shop", async () => {
    const carte = p.locator('[data-article="ZZ Jus"]:visible')
    await carte.waitFor()
    const texte = await carte.innerText()
    verifier(texte.includes("ZZ Jus") && texte.includes("Boissons") && /500/.test(texte), "nom, catégorie et prix sur la carte")
    verifier(!/shop/i.test(texte), "pas de bouton Shop")
    const classe = await carte.locator("img").getAttribute("class")
    verifier(classe.includes("object-contain") && !classe.includes("object-cover"), "image affichée en entier")
    const sansImage = await p.locator('[data-article="ZZ Biscuit"]:visible').innerText()
    verifier(sansImage.includes("Z"), "initiale affichée sans image")
    verifier((await carte.evaluate((el) => getComputedStyle(el).cursor)) === "none", "curseur natif masqué sur les cartes")
  })

  await etape("Curseur cobalt : visible au-dessus d'une carte, point cobalt, masqué ailleurs", async () => {
    const carte = p.locator('[data-article="ZZ Jus"]:visible')
    const boite = await carte.boundingBox()
    await p.mouse.move(boite.x + 40, boite.y + 40)
    await p.mouse.move(boite.x + 60, boite.y + 60)
    await attendre(async () => (await p.locator('[data-testid="curseur-fleche"]').evaluate((el) => getComputedStyle(el).opacity)) === "1", "flèche visible")
    const couleur = await p.locator('[data-testid="curseur-point"]').evaluate((el) => getComputedStyle(el).backgroundColor)
    verifier(couleur === "rgb(0, 71, 171)", "point cobalt (obtenu " + couleur + ")")
    const ticket = await p.getByRole("heading", { name: "Ticket" }).boundingBox()
    await p.mouse.move(ticket.x + 20, ticket.y + 10)
    await attendre(async () => (await p.locator('[data-testid="curseur-fleche"]').evaluate((el) => getComputedStyle(el).opacity)) === "0", "flèche masquée hors des cartes")
  })

  await etape("Sons : bips à l'ajout et au retrait, coupure mémorisée, ka-ching et bruit d'imprimante au paiement", async () => {
    const avant = await compte("__osc")
    await p.locator('[data-article="ZZ Jus"]:visible').click()
    await p.locator('[data-article="ZZ Biscuit"]:visible').click()
    verifier((await compte("__osc")) > avant, "des bips sont produits à l'ajout")
    await p.getByTestId("son-bascule").click()
    verifier((await p.getByTestId("son-bascule").getAttribute("aria-pressed")) === "false", "son coupé")
    verifier((await p.evaluate(() => localStorage.getItem("miam-caisse-son"))) === "0", "choix mémorisé")
    const muet = await compte("__osc")
    await p.locator('[data-article="ZZ Jus"]:visible').click()
    verifier((await compte("__osc")) === muet, "aucun son quand il est coupé")
    await p.getByTestId("son-bascule").click()
    verifier((await p.evaluate(() => localStorage.getItem("miam-caisse-son"))) === "1", "son rétabli")
    await p.locator('[data-mode="CASH"]:visible').click()
    await p.locator("#ca-recu").fill("2000")
    const bruitAvant = await compte("__bruit")
    await p.getByRole("button", { name: "Encaisser" }).click()
    await p.locator('[data-testid="recu-imprimante"]').waitFor()
    await attendre(async () => (await compte("__bruit")) >= bruitAvant + 16, "clics de l'imprimante pendant l'impression")
    await p.locator('[data-testid="recu-imprimante"][data-etape="pret"]').waitFor({ timeout: 15000 })
    verifier((await db.venteComptoir.count({ where: { etablissementId: E.id } })) === 1, "la vente est bien enregistrée")
  })
}

principal()
  .then(() => terminer(nettoyer, "CAISSE UX", 0))
  .catch((e) => {
    console.log("ERREUR : " + e.message)
    return terminer(nettoyer, "CAISSE UX", 1)
  })