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

const PORT = 3138
const BASE = "http://localhost:" + PORT
const mdp = secret()
const GEST = "test-rv-gest@miam.test"

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: GEST } })
  await db.user.deleteMany({ where: { email: GEST } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  await redis.del("rl:fail:" + GEST, "rl:blk:" + GEST)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-RV", name: "ZZ Cantine Revenu", type: "SCHOOL", prepaye: true } })
  await db.user.create({ data: { email: GEST, name: "Test Rv Gest", role: "MANAGER", passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  const art = await db.articleCarte.create({ data: { etablissementId: E.id, nom: "ZZ Jus", prix: 500, categorie: "Boissons" } })
  const ins = await db.inscrit.create({ data: { etablissementId: E.id, matricule: "ZV001", badge: "ZZ-RV-BADGE", firstName: "Zz", lastName: "Revenu" } })
  const ligne = (q) => ({ create: [{ articleId: art.id, libelle: "ZZ Jus", quantite: q, prixUnitaire: 500, montant: 500 * q }] })
  const v1 = await db.venteComptoir.create({ data: { etablissementId: E.id, numero: 1, statut: "PAYEE", methode: "CASH", total: 1000, createdBy: GEST, lignes: ligne(2) } })
  await db.venteComptoir.create({ data: { etablissementId: E.id, numero: 2, statut: "PAYEE", methode: null, total: 500, inscritId: ins.id, createdBy: GEST, lignes: ligne(1) } })
  await db.venteComptoir.create({ data: { etablissementId: E.id, numero: 3, statut: "ANNULEE", methode: "CASH", total: 9000, createdBy: GEST, lignes: ligne(1) } })
  await db.venteRemboursement.create({ data: { etablissementId: E.id, venteId: v1.id, montant: 300, motif: "Essai", createdBy: GEST } })
  // Repas debite d'un compte hors caisse (compte dans le revenu) et debit de caisse (deja compte dans les ventes : ignore).
  await db.transaction.create({ data: { etablissementId: E.id, inscritId: ins.id, type: "DEBIT", montant: -400, reference: "ZZ-RV-D1", createdBy: GEST } })
  await db.transaction.create({ data: { etablissementId: E.id, inscritId: ins.id, type: "DEBIT", montant: -500, reference: "CAISSE-2", createdBy: GEST } })
  await db.transaction.create({ data: { etablissementId: E.id, inscritId: ins.id, type: "TOPUP", methode: "CASH", montant: 5000, reference: "ZZ-RV-T1", createdBy: GEST } })

  await demarrer(BASE, PORT)
  const gest = await connecter(BASE, GEST, mdp)

  await etape("Tableau de bord : revenu = caisse nette (700 + 500) + repas sur comptes (400) = 1600 ; recharges non comptées", async () => {
    await gest.goto(BASE + "/?periode=7j", { waitUntil: "load" })
    await gest.waitForLoadState("networkidle").catch(() => {})
    await gest.locator('[data-testid="kpi-revenu"]').waitFor()
    const valeur = async (id) => Number(await gest.locator('[data-testid="' + id + '"]').getAttribute("data-valeur"))
    verifier((await valeur("kpi-revenu")) === 1600, "revenu de 1600 attendu (obtenu " + (await valeur("kpi-revenu")) + ")")
    verifier((await valeur("kpi-caisse")) === 1200, "ventes caisse nettes de 1200 (obtenu " + (await valeur("kpi-caisse")) + ")")
    verifier((await valeur("kpi-repas-comptes")) === 400, "repas sur comptes de 400 (obtenu " + (await valeur("kpi-repas-comptes")) + ")")
  })
}

principal()
  .then(() => terminer(nettoyer, "DASHBOARD REVENU", 0))
  .catch((e) => {
    console.log("ERREUR : " + e.message)
    return terminer(nettoyer, "DASHBOARD REVENU", 1)
  })