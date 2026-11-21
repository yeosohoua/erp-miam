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
  const p = await (await navigateur.newContext({ locale: "fr-FR", viewport: { width: 1440, height: 1800 } })).newPage()
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

const PORT = 3120
const BASE = "http://localhost:" + PORT
const mdpGest = secret()
const mdpCaisse = secret()
const mdpChef = secret()
const mdpCompta = secret()
const GEST = "test-an-gest@miam.test"
const CAISSE = "test-an-caisse@miam.test"
const CHEF = "test-an-chef@miam.test"
const COMPTA = "test-an-compta@miam.test"
const EMAILS = [GEST, CAISSE, CHEF, COMPTA]

const iso = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)
const dateDb = (s) => new Date(s + "T00:00:00.000Z")

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: { in: EMAILS } } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-AN", name: "ZZ Cantine Analytics", type: "SCHOOL" } })
  const E2 = await db.etablissement.create({ data: { code: "ZZ-AM", name: "ZZ Autre Analytics", type: "SCHOOL" } })
  const creerUser = (email, name, role, mdp) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  await creerUser(GEST, "Test An Gest", "MANAGER", mdpGest)
  await creerUser(CAISSE, "Test An Caisse", "CASHIER", mdpCaisse)
  await creerUser(CHEF, "Test An Chef", "CHEF", mdpChef)
  await creerUser(COMPTA, "Test An Compta", "ACCOUNTANT", mdpCompta)
  await db.inscrit.create({ data: { etablissementId: E.id, matricule: "ZZ-A1", firstName: "Awa", lastName: "Palette", badge: "ZZBADGE-A1", solde: 0 } })
  await db.inscrit.create({ data: { etablissementId: E2.id, matricule: "ZZ-X1", firstName: "Autre", lastName: "Palette", badge: "ZZBADGE-AX", solde: 0 } })
  await db.plat.create({ data: { etablissementId: E.id, name: "ZZ Gratin" } })
  await db.plat.create({ data: { etablissementId: E2.id, name: "ZZ Gratin lointain" } })
  await db.consommation.create({ data: { etablissementId: E.id, date: dateDb(iso(1)), service: "LUNCH", repas: 40 } })
  await db.consommation.create({ data: { etablissementId: E.id, date: dateDb(iso(2)), service: "LUNCH", repas: 60 } })
  await db.consommation.create({ data: { etablissementId: E2.id, date: dateDb(iso(1)), service: "LUNCH", repas: 500 } })

  process.env.CRON_SECRET = secret() + secret()
  await demarrer(BASE, PORT)
  const gest = await connecter(BASE, GEST, mdpGest)
  const chef = await connecter(BASE, CHEF, mdpChef)
  const caisse = await connecter(BASE, CAISSE, mdpCaisse)
  const compta = await connecter(BASE, COMPTA, mdpCompta)
  const aller = async (p, chemin, testid) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
  }
  const kpi = async (p, id) => Number(await p.locator('[data-kpi="' + id + '"]').first().getAttribute("data-valeur"))
  const ouvrirPalette = async (p) => {
    await p.keyboard.press("Control+k")
    await p.locator('[data-testid="palette-input"]').waitFor()
  }
  const fermerPalette = async (p) => {
    await p.keyboard.press("Escape")
    await p.locator('[data-testid="palette-input"]').waitFor({ state: "detached" })
  }
  const chercher = async (p, q) => {
    await p.locator('[data-testid="palette-input"]').fill(q)
    await sleep(900)
  }
  const nb = (p, groupe) => p.locator('[data-testid="palette-resultat"][data-groupe="' + groupe + '"]').count()

  await etape("Accès par rôle : onglets du gestionnaire, du comptable et du chef ; caissier refusé", async () => {
    await aller(gest, "/analytics", "analytics-page")
    verifier((await gest.locator('[data-onglet]').count()) === 7, "le gestionnaire voit 7 onglets")
    await aller(compta, "/analytics?vue=finances", "analytics-page")
    verifier((await compta.locator('[data-testid="analytics-page"]').getAttribute("data-vue")) === "finances", "le comptable voit les finances")
    await aller(chef, "/analytics", "analytics-page")
    verifier((await chef.locator('[data-onglet]').count()) === 4, "le chef voit 4 onglets")
    verifier((await chef.locator('[data-onglet="finances"]').count()) === 0 && (await chef.locator('[data-onglet="caisse"]').count()) === 0, "le chef n'a ni finances ni caisse")
    await aller(chef, "/analytics?vue=finances", "analytics-page")
    verifier((await chef.locator('[data-testid="analytics-page"]').getAttribute("data-vue")) !== "finances", "le chef ne peut pas forcer l'onglet finances")
    await aller(caisse, "/analytics", "acces-refuse")
    verifier((await caisse.locator('[data-testid="analytics-page"]').count()) === 0, "le caissier n'accède pas à Analytics")
  })

  await etape("Indicateurs : repas servis calculés sur les données de l'établissement seulement", async () => {
    await aller(gest, "/analytics?vue=frequentation&p=7", "analytics-page")
    verifier((await kpi(gest, "servis")) === 100, "servis = 40 + 60, sans les 500 de l'autre établissement")
    await aller(gest, "/analytics?vue=apercu&p=30", "analytics-page")
    verifier((await kpi(gest, "servis")) === 100, "aperçu : servis = 100")
    verifier((await gest.locator('[data-kpi="ca"]').count()) === 1, "le gestionnaire voit le chiffre d'affaires")
    await aller(chef, "/analytics?vue=apercu&p=30", "analytics-page")
    verifier((await chef.locator('[data-kpi="ca"]').count()) === 0 && (await chef.locator('[data-kpi="marge"]').count()) === 0, "le chef ne voit pas les chiffres financiers")
    verifier((await kpi(chef, "servis")) === 100, "le chef voit les repas servis")
  })

  await etape("Période et graphiques : sélecteur 7/30/90 jours, carte de chaleur et calendrier", async () => {
    await aller(gest, "/analytics?vue=frequentation&p=30", "analytics-page")
    verifier((await gest.locator('[data-testid="analytics-page"]').getAttribute("data-periode")) === "30", "période 30 jours")
    await gest.locator('[data-periode-lien="90"]').click()
    await gest.waitForURL((u) => u.searchParams.get("p") === "90")
    await gest.locator('[data-testid="analytics-page"][data-periode="90"]').waitFor()
    await gest.locator('[data-testid="carte-chaleur"]:visible').waitFor()
    await gest.locator('[data-testid="calendrier-thermique"]:visible').waitFor()
    await gest.locator('[data-onglet="stock"]').click()
    await gest.locator('[data-testid="analytics-page"][data-vue="stock"]').waitFor()
    verifier((await gest.locator('[data-testid="analytics-page"]').getAttribute("data-periode")) === "90", "la période est conservée en changeant d'onglet")
  })

  await etape("Export CSV : contenu, droits, entrées invalides et audit", async () => {
    const ok = await gest.request.get(BASE + "/api/analytics/export?vue=frequentation&p=30&table=0")
    verifier(ok.status() === 200, "export gestionnaire 200 (obtenu " + ok.status() + ")")
    verifier((ok.headers()["content-type"] ?? "").includes("text/csv"), "type CSV")
    verifier((ok.headers()["content-disposition"] ?? "").includes("attachment"), "en-tête de téléchargement")
    const corps = await ok.body()
    verifier(corps[0] === 0xef && corps[1] === 0xbb && corps[2] === 0xbf, "BOM UTF-8 présent")
    verifier(corps.toString("utf8").includes(";"), "séparateur point-virgule")
    verifier((await compta.request.get(BASE + "/api/analytics/export?vue=finances&p=30&table=0")).status() === 200, "le comptable exporte les finances")
    verifier((await chef.request.get(BASE + "/api/analytics/export?vue=finances&p=30&table=0")).status() === 403, "le chef n'exporte pas les finances")
    verifier((await chef.request.get(BASE + "/api/analytics/export?vue=production&p=30&table=0")).status() === 200, "le chef exporte la production")
    verifier((await caisse.request.get(BASE + "/api/analytics/export?vue=frequentation&p=30&table=0")).status() === 403, "le caissier est refusé")
    const anonyme = await fetch(BASE + "/api/analytics/export?vue=frequentation&p=30&table=0", { redirect: "manual" })
    const versLogin = anonyme.status >= 300 && anonyme.status < 400 && (anonyme.headers.get("location") ?? "").includes("/login")
    verifier(anonyme.status === 401 || versLogin, "sans session : refus ou redirection vers /login (obtenu " + anonyme.status + ")")
    verifier(!(anonyme.headers.get("content-type") ?? "").includes("text/csv"), "sans session : aucun CSV servi")
    verifier((await gest.request.get(BASE + "/api/analytics/export?vue=zz&p=30&table=0")).status() === 400, "rubrique inconnue : 400")
    verifier((await gest.request.get(BASE + "/api/analytics/export?vue=frequentation&p=30&table=99")).status() === 400, "tableau inconnu : 400")
    verifier(!!(await db.auditLog.findFirst({ where: { action: "ANALYTICS_EXPORT", userEmail: GEST } })), "audit ANALYTICS_EXPORT")
  })

  await etape("Palette Ctrl+K : ouverture, pages selon le rôle, navigation, fermeture", async () => {
    await aller(gest, "/analytics?vue=apercu&p=30", "analytics-page")
    await ouvrirPalette(gest)
    await chercher(gest, "analytics")
    verifier((await gest.locator('[data-testid="palette-resultat"][data-url="/analytics"]').count()) >= 1, "le gestionnaire trouve la page Analytics")
    await fermerPalette(gest)
    await aller(caisse, "/", "menu-principal")
    await ouvrirPalette(caisse)
    await chercher(caisse, "analytics")
    verifier((await caisse.locator('[data-testid="palette-resultat"][data-url="/analytics"]').count()) === 0, "le caissier ne trouve pas Analytics")
    await chercher(caisse, "caisse")
    verifier((await caisse.locator('[data-testid="palette-resultat"][data-url="/caisse"]').count()) >= 1, "le caissier trouve la page Caisse")
    await fermerPalette(caisse)
    await ouvrirPalette(gest)
    await chercher(gest, "inscrits")
    await gest.locator('[data-testid="palette-resultat"][data-groupe="Pages"][data-url="/inscrits"]').first().click()
    await gest.waitForURL((u) => u.pathname === "/inscrits")
  })

  await etape("Recherche de la palette : droits par rôle et isolation entre établissements", async () => {
    await aller(gest, "/", "menu-principal")
    await ouvrirPalette(gest)
    await chercher(gest, "Palette")
    await attendre(async () => (await nb(gest, "Inscrits")) >= 1, "résultat inscrit du gestionnaire", 10000)
    verifier((await nb(gest, "Inscrits")) === 1, "un seul inscrit : celui de l'établissement courant")
    await fermerPalette(gest)

    await aller(caisse, "/", "menu-principal")
    await ouvrirPalette(caisse)
    await chercher(caisse, "Palette")
    await attendre(async () => (await nb(caisse, "Inscrits")) >= 1, "résultat inscrit du caissier", 10000)
    await chercher(caisse, "ZZ Gratin")
    verifier((await nb(caisse, "Plats")) === 0, "le caissier ne cherche pas dans les plats")
    await fermerPalette(caisse)

    await aller(chef, "/", "menu-principal")
    await ouvrirPalette(chef)
    await chercher(chef, "Palette")
    verifier((await nb(chef, "Inscrits")) === 0, "le chef ne cherche pas dans les inscrits")
    await chercher(chef, "ZZ Gratin")
    await attendre(async () => (await nb(chef, "Plats")) >= 1, "résultat plat du chef", 10000)
    verifier((await nb(chef, "Plats")) === 1, "un seul plat : celui de l'établissement courant")
    await fermerPalette(chef)
  })

  await terminer(nettoyer, "ANALYTICS", 0)
}

principal().catch(async (e) => {
  console.error("Echec : " + (e && e.message ? e.message : e))
  await terminer(nettoyer, "ANALYTICS", 1)
})