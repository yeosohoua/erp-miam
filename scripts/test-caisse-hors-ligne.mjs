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
async function attendre(fn, message, delai = 40000) {
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

const PORT = 3136
const BASE = "http://localhost:" + PORT
const mdpCais = secret()
const CAIS = "test-hl-cais@miam.test"

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: CAIS } })
  await db.user.deleteMany({ where: { email: CAIS } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  await redis.del("rl:fail:" + CAIS, "rl:blk:" + CAIS)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-HL", name: "ZZ Cantine Hors Ligne", type: "SCHOOL", prepaye: true } })
  const user = await db.user.create({ data: { email: CAIS, name: "Test Hl Cais", role: "CASHIER", passwordHash: bcrypt.hashSync(mdpCais, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  await db.articleCarte.create({ data: { etablissementId: E.id, nom: "ZZ Jus", prix: 500, categorie: "Boissons" } })
  const sess = await db.sessionCaisse.create({ data: { etablissementId: E.id, numero: 1, caissierEmail: CAIS, fondInitial: 1000 } })
  const CLE = "miam-caisse-hl:" + E.id + ":" + user.id

  await demarrer(BASE, PORT)
  const p = await connecter(BASE, CAIS, mdpCais)
  await p.goto(BASE + "/caisse", { waitUntil: "load" })
  await p.waitForLoadState("networkidle").catch(() => {})
  await p.locator('[data-testid="caisse-page"]:visible').waitFor()
  const file = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "[]"), CLE)
  let sauvegardeFile = null
  let heureHorsLigne = 0

  await etape("Hors ligne : vente en espèces gardée sur l'appareil avec reçu provisoire, paiement sur compte refusé", async () => {
    await p.context().setOffline(true)
    await p.locator('[data-testid="hl-etat"][data-en-ligne="0"]').waitFor()
    await p.locator('[data-article="ZZ Jus"]:visible').click()
    await p.locator('[data-article="ZZ Jus"]:visible').click()
    await p.locator('[data-mode="CASH"]:visible').click()
    await p.locator("#ca-recu").fill("1000")
    heureHorsLigne = Date.now()
    await p.getByRole("button", { name: "Encaisser" }).click()
    await p.locator('[data-testid="caisse-hors-ligne-ok"]').waitFor()
    await p.locator('[data-testid="recu-imprimante"][data-ticket="HL-001"]').waitFor()
    const f = await file()
    verifier(f.length === 1 && f[0].total === 1000 && f[0].mode === "CASH" && f[0].recu === 1000, "une vente de 1000 en file locale")
    sauvegardeFile = JSON.stringify(f)
    verifier((await db.venteComptoir.count({ where: { etablissementId: E.id } })) === 0, "rien n'est encore enregistré sur le serveur")
    verifier((await p.locator('[data-testid="hl-etat"]').getAttribute("data-attente")) === "1", "bandeau : une vente en attente")

    await p.locator('[data-article="ZZ Jus"]:visible').click()
    await p.locator('[data-mode="COMPTE"]:visible').click()
    await p.locator("#ca-identifiant").fill("ZZ-QUELCONQUE")
    await p.getByRole("button", { name: "Encaisser" }).click()
    await p.locator('[data-testid="caisse-erreur"]:visible').filter({ hasText: "connexion" }).waitFor()
    verifier((await file()).length === 1, "la vente sur compte n'est pas mise en file")
  })

  await etape("Retour du réseau : synchronisation automatique, vente datée de l'encaissement, rattachée à la caisse, file vide", async () => {
    await p.context().setOffline(false)
    const v = await attendre(() => db.venteComptoir.findFirst({ where: { etablissementId: E.id } }), "vente synchronisée")
    verifier(v.total === 1000 && v.methode === "CASH" && v.recu === 1000 && v.numero === 1 && v.createdBy === CAIS, "vente de 1000 en espèces, numéro officiel 1")
    verifier(v.cleHorsLigne && v.sessionId === sess.id, "clé d'idempotence et caisse ouverte")
    verifier(Math.abs(v.createdAt.getTime() - heureHorsLigne) < 15000, "horodatage de l'encaissement hors ligne conservé")
    await attendre(async () => (await file()).length === 0, "file locale vidée")
    await attendre(async () => (await p.locator('[data-testid="hl-etat"]').count()) === 0, "bandeau disparu")
    verifier((await db.auditLog.count({ where: { userEmail: CAIS, action: "VENTE_HORS_LIGNE" } })) === 1, "audit de la synchronisation")
  })

  await etape("Idempotence : la même vente rejouée n'est jamais enregistrée deux fois", async () => {
    await p.evaluate(([k, v]) => localStorage.setItem(k, v), [CLE, sauvegardeFile])
    await attendre(async () => (await file()).length === 0, "file rejouée puis vidée", 60000)
    verifier((await db.venteComptoir.count({ where: { etablissementId: E.id } })) === 1, "toujours une seule vente")
    verifier((await db.auditLog.count({ where: { userEmail: CAIS, action: "VENTE_HORS_LIGNE" } })) === 1, "pas de second audit")
  })

  await etape("Vente refusée au retour (article supprimé) : listée avec son motif, puis écartée", async () => {
    const f = JSON.parse(sauvegardeFile)
    f[0].cle = "test-hl-refus-0001"
    f[0].lignes[0].articleId = "article-inexistant-0001"
    await p.evaluate(([k, v]) => localStorage.setItem(k, v), [CLE, JSON.stringify(f)])
    await p.locator('[data-rejet="HL-001"]').waitFor({ timeout: 60000 })
    verifier((await db.venteComptoir.count({ where: { etablissementId: E.id } })) === 1, "aucune vente créée")
    await p.locator('[data-rejet="HL-001"]').getByRole("button", { name: "Écarter" }).click()
    await attendre(async () => (await p.locator('[data-rejet]').count()) === 0, "refus écarté")
  })
}

principal()
  .then(() => terminer(nettoyer, "CAISSE HORS LIGNE", 0))
  .catch((e) => {
    console.log("ERREUR : " + e.message)
    return terminer(nettoyer, "CAISSE HORS LIGNE", 1)
  })