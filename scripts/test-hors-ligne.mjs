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
const AUJ = new Date().toISOString().slice(0, 10)
const dateUtc = (iso) => new Date(iso + "T00:00:00.000Z")

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

async function nouvellePage() {
  const p = await (await navigateur.newContext({ locale: "fr-FR", viewport: { width: 1440, height: 1400 } })).newPage()
  p.setDefaultTimeout(30000)
  return p
}

async function connecter(BASE, email, mdp) {
  const p = await nouvellePage()
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

const PORT = 3115
const BASE = "http://localhost:" + PORT
const URL_SERVICE = BASE + "/service?service=LUNCH"
const mdpCaisse = secret()
const mdpChef = secret()
const CAISSE = "test-hl-caisse@miam.test"
const CHEF = "test-hl-chef@miam.test"
const EMAILS = [CAISSE, CHEF]
const BADGE_A = "ZZO" + "1".padStart(13, "0")

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: { in: EMAILS } } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-HL", name: "ZZ Cantine HL", type: "SCHOOL", prepaye: true } })
  await db.tarif.create({ data: { etablissementId: E.id, service: "LUNCH", prix: 500 } })
  const creerUser = (email, name, role, mdp) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  await creerUser(CAISSE, "Test Hl Caisse", "CASHIER", mdpCaisse)
  await creerUser(CHEF, "Test Hl Chef", "CHEF", mdpChef)
  const inscrit = (n, matricule, nom, solde) =>
    db.inscrit.create({ data: { etablissementId: E.id, matricule, firstName: nom, lastName: "Hl", badge: "ZZO" + String(n).padStart(13, "0"), solde } })
  const A = await inscrit(1, "ZZO-A", "Alpha", 2000)
  const B = await inscrit(2, "ZZO-B", "Bravo", 200)
  const C = await inscrit(3, "ZZO-C", "Charlie", 2000)
  const D = await inscrit(4, "ZZO-D", "Delta", 2000)
  const F = await inscrit(5, "ZZO-E", "Echo", 2000)
  await db.menu.create({ data: { etablissementId: E.id, date: dateUtc(AUJ), service: "LUNCH", statut: "PUBLISHED" } })
  const reserver = (ins) => db.reservation.create({ data: { etablissementId: E.id, inscritId: ins.id, date: dateUtc(AUJ), service: "LUNCH", statut: "BOOKED" } })
  await reserver(A)
  await reserver(B)
  const resD = await reserver(D)
  await reserver(F)

  await demarrer(BASE, PORT)
  const page = await connecter(BASE, CAISSE, mdpCaisse)
  const contexte = page.context()
  const etat = () => page.locator('[data-testid="etat-reseau"]:visible')
  const attr = async (nom) => etat().getAttribute(nom)
  const ouvrirService = async () => {
    await page.goto(URL_SERVICE, { waitUntil: "load" })
    await page.waitForLoadState("networkidle").catch(() => {})
    await page.locator('[data-testid="service-page"]:visible').waitFor()
    await etat().waitFor()
    await sleep(500)
  }
  const reseau = async (enLigne) => {
    await contexte.setOffline(!enLigne)
    await attendre(async () => (await attr("data-en-ligne")) === (enLigne ? "1" : "0"), enLigne ? "retour en ligne détecté" : "coupure détectée", 40000)
  }
  const scanner = async (code, statut, attendu) => {
    await page.locator("#scan-code:visible").fill(code)
    await page.getByRole("button", { name: "Valider" }).click()
    await page.locator('[data-testid="resultat-scan"][data-statut="' + statut + '"][data-code="' + attendu + '"]:visible').waitFor()
  }
  const forcer = async (statut, attendu) => {
    await page.getByRole("button", { name: "Servir quand même" }).click()
    await page.locator('[data-testid="resultat-scan"][data-statut="' + statut + '"][data-code="' + attendu + '"]:visible').waitFor()
  }
  const attente = async (n) => attendre(async () => (await attr("data-attente")) === String(n), n + " passage(s) en attente")
  const preparer = async () => {
    await page.getByRole("button", { name: "Préparer le hors-ligne" }).click()
    await attendre(async () => (await attr("data-pret")) === "1", "liste hors-ligne prête")
  }
  const dbServi = async (id) => (await db.reservation.findFirst({ where: { inscritId: id, date: dateUtc(AUJ), service: "LUNCH" } }))?.servedAt ?? null
  const solde = async (id) => (await db.inscrit.findUnique({ where: { id } })).solde

  await etape("Préparation : liste du jour téléchargée sur l'appareil", async () => {
    await ouvrirService()
    verifier((await attr("data-en-ligne")) === "1" && (await attr("data-pret")) === "0", "en ligne, aucune liste au départ")
    await preparer()
    verifier((await attr("data-effectif")) === "4", "quatre repas réservés dans la liste (A, B, D, E)")
  })

  await etape("Hors-ligne : scan, déjà servi, solde insuffisant et exception décidés localement", async () => {
    await reseau(false)
    await scanner(BADGE_A, "SERVI", "ZZO-A")
    verifier((await page.locator('[data-testid="resultat-scan"]:visible').getAttribute("data-hors-ligne")) === "1", "résultat marqué hors-ligne")
    await scanner("ZZO-A", "DEJA", "ZZO-A")
    await scanner("ZZO-B", "SOLDE_INSUFFISANT", "ZZO-B")
    await forcer("SERVI", "ZZO-B")
    await scanner("ZZO-C", "SANS_RESERVATION", "ZZO-C")
    await forcer("SERVI", "ZZO-C")
    await attente(3)
    verifier((await dbServi(A.id)) === null && (await dbServi(B.id)) === null, "rien n'est encore enregistré côté serveur")
  })

  await etape("Rechargement sans réseau : page, liste et file de passages conservées", async () => {
    await page.reload({ waitUntil: "domcontentloaded" })
    await page.locator('[data-testid="service-page"]:visible').waitFor()
    await etat().waitFor()
    await attendre(async () => (await attr("data-en-ligne")) === "0", "toujours hors-ligne après rechargement", 40000)
    await attente(3)
    verifier((await attr("data-pret")) === "1", "liste hors-ligne toujours présente")
    await scanner("ZZO-E", "SERVI", "ZZO-E")
    await attente(4)
  })

  await etape("Retour du réseau : synchronisation automatique, doublon détecté, aucun double débit", async () => {
    await scanner("ZZO-D", "SERVI", "ZZO-D")
    await attente(5)
    // Un autre poste a servi D pendant ce temps.
    await db.reservation.update({ where: { id: resD.id }, data: { servedAt: new Date() } })
    await reseau(true)
    await attendre(async () => (await attr("data-attente")) === "0", "file synchronisée", 60000)
    const rapport = page.locator('[data-testid="rapport-sync"]:visible')
    await rapport.waitFor()
    verifier((await rapport.getAttribute("data-ok")) === "4", "quatre passages enregistrés")
    verifier((await rapport.getAttribute("data-doublons")) === "1", "un doublon signalé")
    verifier((await rapport.getAttribute("data-rejets")) === "0", "aucun rejet")
    for (const ins of [A, B, C, F]) verifier(!!(await dbServi(ins.id)), "repas enregistré pour " + ins.matricule)
    const resC = await db.reservation.findFirst({ where: { inscritId: C.id, date: dateUtc(AUJ), service: "LUNCH" } })
    verifier(resC?.walkIn === true, "C servi hors réservation")
    verifier((await solde(A.id)) === 1500 && (await solde(B.id)) === -300 && (await solde(C.id)) === 1500 && (await solde(F.id)) === 1500, "soldes débités une fois")
    verifier((await solde(D.id)) === 2000 && (await db.transaction.count({ where: { inscritId: D.id, type: "DEBIT" } })) === 0, "doublon : aucun débit")
  })

  await etape("Audit, compteurs du serveur et notification de reprise", async () => {
    const ligne = async (action, contient) => db.auditLog.findFirst({ where: { action, userEmail: CAISSE, details: { contains: contient } } })
    verifier(!!(await ligne("SERVICE_SERVED", "ZZO-A (hors-ligne)")), "audit du passage hors-ligne")
    verifier(!!(await ligne("SERVICE_SERVED", "(solde négatif)")), "solde négatif tracé")
    verifier(!!(await ligne("SERVICE_WALKIN", "ZZO-C (hors-ligne)")), "exception tracée")
    verifier(!!(await ligne("SERVICE_SYNC", "1 doublon")), "synchronisation tracée")
    await ouvrirService()
    const c = page.locator('[data-testid="compteurs-service"]:visible')
    verifier((await c.getAttribute("data-servis")) === "5" && (await c.getAttribute("data-hors")) === "1", "compteurs du service à jour")
  })

  await etape("Effacement : données retirées de l'appareil, scan hors-ligne refusé sans liste", async () => {
    await page.getByRole("button", { name: "Effacer les données hors-ligne" }).click()
    await attendre(async () => (await attr("data-pret")) === "0", "liste effacée")
    await reseau(false)
    await scanner("ZZO-A", "ERREUR", "")
    await page.getByText("aucune liste préparée").first().waitFor()
    await reseau(true)
  })

  await etape("Code inconnu : accepté sur place puis rejeté clairement à la synchronisation", async () => {
    await preparer()
    verifier((await attr("data-effectif")) === "5", "cinq repas dans la nouvelle liste")
    await reseau(false)
    await scanner("ZZO-A", "DEJA", "ZZO-A")
    await scanner("ZZINCONNU999", "SANS_RESERVATION", "ZZINCONNU999")
    await forcer("SERVI", "ZZINCONNU999")
    await attente(1)
    const avant = await db.reservation.count({ where: { etablissementId: E.id } })
    await reseau(true)
    await attendre(async () => (await attr("data-attente")) === "0", "file synchronisée", 60000)
    const rapport = page.locator('[data-testid="rapport-sync"]:visible')
    await rapport.waitFor()
    verifier((await rapport.getAttribute("data-rejets")) === "1" && (await rapport.getAttribute("data-ok")) === "0", "un rejet, rien d'enregistré")
    await rapport.getByText("inconnu").first().waitFor()
    verifier((await db.reservation.count({ where: { etablissementId: E.id } })) === avant, "aucune réservation créée pour un code inconnu")
  })

  await etape("Droits : un chef consulte le service sans outil de scan ni hors-ligne", async () => {
    const chef = await connecter(BASE, CHEF, mdpChef)
    await chef.goto(URL_SERVICE, { waitUntil: "load" })
    await chef.locator('[data-testid="service-page"]:visible').waitFor()
    verifier((await chef.locator('[data-testid="etat-reseau"]').count()) === 0 && (await chef.locator("#scan-code").count()) === 0, "aucun outil de scan pour le chef")
  })

  await terminer(nettoyer, "HORS-LIGNE", 0)
}

principal().catch(async (e) => {
  console.error("Echec : " + (e && e.message ? e.message : e))
  await terminer(nettoyer, "HORS-LIGNE", 1)
})