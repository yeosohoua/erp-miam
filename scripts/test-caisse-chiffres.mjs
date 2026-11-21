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

const PORT = 3134
const BASE = "http://localhost:" + PORT
const mdpGest = secret()
const mdpCais = secret()
const GEST = "test-ch-gest@miam.test"
const CAIS = "test-ch-cais@miam.test"
const EMAILS = [GEST, CAIS]

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: { in: EMAILS } } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-CH", name: "ZZ Cantine Chiffres", type: "SCHOOL", prepaye: true } })
  const creerUser = (email, name, role, mdp) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  await creerUser(GEST, "Test Ch Gest", "MANAGER", mdpGest)
  await creerUser(CAIS, "Test Ch Cais", "CASHIER", mdpCais)
  const art = await db.articleCarte.create({ data: { etablissementId: E.id, nom: "ZZ Jus", prix: 500, categorie: "Boissons" } })
  const ins = await db.inscrit.create({ data: { etablissementId: E.id, matricule: "ZZ-CH-1", badge: "ZZ-CH-BADGE", firstName: "Zz", lastName: "Chiffres" } })
  const sess = await db.sessionCaisse.create({ data: { etablissementId: E.id, numero: 1, caissierEmail: CAIS, fondInitial: 1000 } })
  await sleep(50)
  await db.transaction.create({ data: { etablissementId: E.id, inscritId: ins.id, type: "TOPUP", methode: "CASH", montant: 500, reference: "ZZ-CH-T1", createdBy: CAIS } })
  const ligne = (q) => ({ create: [{ articleId: art.id, libelle: "ZZ Jus", quantite: q, prixUnitaire: 500, montant: 500 * q }] })
  const v1 = await db.venteComptoir.create({ data: { etablissementId: E.id, numero: 1, statut: "PAYEE", methode: "CASH", total: 1000, createdBy: CAIS, sessionId: sess.id, lignes: ligne(2) } })
  await db.venteComptoir.create({ data: { etablissementId: E.id, numero: 2, statut: "PAYEE", methode: "CASH", total: 1000, partCompte: 300, inscritId: ins.id, createdBy: CAIS, sessionId: sess.id, lignes: ligne(2) } })
  await db.venteComptoir.create({ data: { etablissementId: E.id, numero: 3, statut: "PAYEE", methode: null, total: 500, inscritId: ins.id, createdBy: CAIS, sessionId: sess.id, lignes: ligne(1) } })
  await db.venteRemboursement.create({ data: { etablissementId: E.id, venteId: v1.id, montant: 300, motif: "Essai", createdBy: GEST } })

  await demarrer(BASE, PORT)
  const gest = await connecter(BASE, GEST, mdpGest)
  const aller = async (p, chemin, testid) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
  }

  await etape("Tableau des caisses : une caisse ouverte compte fond, espèces (hors part sur compte) et recharge", async () => {
    await aller(gest, "/caisse", "caisse-page")
    const attendu = await gest.locator('tr[data-session="1"]').getAttribute("data-attendu")
    verifier(attendu === "3200", "1000 de fond + 1000 + 700 d'espèces + 500 de recharge = 3200 (obtenu " + attendu + ")")
  })

  await etape("Analytique : chiffre d'affaires net des remboursements partiels (700 + 1000 + 500 = 2200)", async () => {
    await aller(gest, "/analytics?vue=caisse&p=30", "analytics-page")
    const ca = Number(await gest.locator('[data-kpi="caisse-ca"]').first().getAttribute("data-valeur"))
    verifier(ca === 2200, "chiffre d'affaires de 2200 attendu (obtenu " + ca + ")")
  })
}

principal()
  .then(() => terminer(nettoyer, "CAISSE CHIFFRES", 0))
  .catch((e) => {
    console.log("ERREUR : " + e.message)
    return terminer(nettoyer, "CAISSE CHIFFRES", 1)
  })