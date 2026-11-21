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
const jourDecale = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
const dateUtc = (iso) => new Date(iso + "T00:00:00.000Z")
const AUJ = jourDecale(0)

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
  const p = await (await navigateur.newContext({ locale: "fr-FR", viewport: { width: 1440, height: 1000 } })).newPage()
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
const PORT = 3108
const BASE = "http://localhost:" + PORT
const mdpMgr = secret()
const mdpCaisse = secret()
const mdpParent = secret()
const MGR = "test-db-mgr@miam.test"
const CAISSE = "test-db-caisse@miam.test"
const PARENT = "test-db-parent@miam.test"
const EMAILS = [MGR, CAISSE, PARENT]

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { OR: [{ userEmail: { in: EMAILS } }, { details: { contains: "ZZ" } }] } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const IA = await db.etablissement.create({ data: { code: "ZZ-DA", name: "ZZ Ecole DA", type: "SCHOOL" } })
  const creerUser = (email, name, role, mdp) =>
    db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: IA.id }] } } })
  await creerUser(MGR, "Test Db Mgr", "MANAGER", mdpMgr)
  await creerUser(CAISSE, "Test Db Caisse", "CASHIER", mdpCaisse)
  await creerUser(PARENT, "Test Db Parent", "PARENT", mdpParent)

  const g1 = await db.referentiel.create({ data: { etablissementId: IA.id, kind: "GROUPE", name: "ZZ Groupe D1" } })
  const g2 = await db.referentiel.create({ data: { etablissementId: IA.id, kind: "GROUPE", name: "ZZ Groupe D2" } })
  const inscrit = (n, statutIns, groupeId) =>
    db.inscrit.create({ data: { etablissementId: IA.id, matricule: "ZZD-" + n, firstName: "Db", lastName: "Nom" + n, badge: "ZZD" + String(n).padStart(13, "0"), statut: statutIns, groupeId } })
  const d1 = await inscrit(1, "ACTIVE", g1.id)
  const d2 = await inscrit(2, "ACTIVE", g1.id)
  const d3 = await inscrit(3, "ACTIVE", g2.id)
  await inscrit(4, "ACTIVE", undefined)
  await inscrit(5, "SUSPENDED", undefined)

  // Un plat a 200 par portion (2 x 100) servi au dejeuner.
  const ing = await db.ingredient.create({ data: { etablissementId: IA.id, name: "ZZ Ing D", unit: "kg", unitCost: 100 } })
  const plat = await db.plat.create({ data: { etablissementId: IA.id, name: "ZZ Plat D", portions: 1, ingredients: { create: [{ ingredientId: ing.id, quantity: 2 }] } } })
  for (const j of [0, -1, -10]) {
    await db.menu.create({ data: { etablissementId: IA.id, date: dateUtc(jourDecale(j)), service: "LUNCH", statut: "PUBLISHED", plats: { create: [{ platId: plat.id }] } } })
  }
  const res = (inscrit, j, servi, walkIn = false) =>
    db.reservation.create({ data: { etablissementId: IA.id, inscritId: inscrit.id, date: dateUtc(jourDecale(j)), service: "LUNCH", servedAt: servi ? new Date() : null, walkIn } })
  await res(d1, 0, true)
  await res(d2, 0, true, true)
  await res(d3, 0, false)
  await res(d1, -1, true)
  await res(d2, -1, true)
  await res(d1, -10, true)
  await res(d2, -10, false)
  await db.reservation.create({ data: { etablissementId: IA.id, inscritId: d3.id, date: dateUtc(jourDecale(-1)), service: "LUNCH", statut: "CANCELLED" } })

  const kpi = (p, id, attr = "data-valeur") => p.locator('[data-testid="' + id + '"]').getAttribute(attr)
  const surface = (p, id) => p.locator('[data-testid="' + id + '"] .recharts-surface').first().waitFor()

  await demarrer(BASE, PORT)
  const mgr = await connecter(BASE, MGR, mdpMgr)

  await etape("7 jours : indicateurs, variation, coût estimé et classement des groupes", async () => {
    await mgr.goto(BASE + "/", { waitUntil: "load" })
    await mgr.locator('[data-testid="kpis"]').waitFor()
    verifier((await kpi(mgr, "kpi-servis")) === "4", "4 repas servis sur 7 jours")
    verifier((await kpi(mgr, "kpi-taux")) === "80", "taux de présence 80 %")
    verifier((await kpi(mgr, "kpi-inscrits")) === "4", "4 inscrits actifs")
    verifier((await kpi(mgr, "kpi-cout")) === "800", "coût estimé 800")
    verifier((await mgr.locator('[data-testid="kpi-servis"]').innerText()).includes("+300"), "variation +300 % face à la période précédente")
    const top = mgr.locator('[data-testid="top-groupes"] li[data-groupe="ZZ Groupe D1"]')
    await top.waitFor()
    verifier((await top.getAttribute("data-servis")) === "4", "le groupe D1 totalise 4 repas")
    verifier((await mgr.locator('[data-testid="top-groupes"] li[data-groupe="ZZ Groupe D2"]').count()) === 0, "un groupe sans repas servi n'est pas classé")
  })

  await etape("Graphiques : fréquentation, répartition par service et objectif sont dessinés", async () => {
    await surface(mgr, "graphique-frequentation")
    await surface(mgr, "graphique-services")
    await surface(mgr, "graphique-performance")
    await surface(mgr, "graphique-reservations")
  })

  await etape("Menus à venir et insights", async () => {
    const menus = mgr.locator('[data-testid="menus-semaine"]')
    verifier((await menus.getAttribute("data-publies")) === "1" && (await menus.getAttribute("data-manquants")) === "27", "1 menu publié sur 28 créneaux")
    const texte = await mgr.locator('[data-testid="insights"]').innerText()
    verifier(texte.includes("Déjeuner") && texte.includes("80 %") && texte.includes("27 créneau"), "insights : service, taux et menus manquants")
    verifier(texte.includes("hors réservation"), "insight sur les repas hors réservation")
  })

  await etape("Objectif du mois, service du jour et issue des réservations", async () => {
    const mois = AUJ.slice(0, 7)
    const jours = [
      { j: 0, booked: 3, served: 2 },
      { j: -1, booked: 2, served: 2 },
      { j: -10, booked: 2, served: 1 },
    ].filter((x) => jourDecale(x.j).startsWith(mois))
    const cible = jours.reduce((t, x) => t + x.booked, 0)
    const servisMois = jours.reduce((t, x) => t + x.served, 0)
    const bloc = mgr.locator('[data-testid="objectif-mois"]')
    await bloc.waitFor()
    verifier((await bloc.getAttribute("data-cible")) === String(cible) && (await bloc.getAttribute("data-servis")) === String(servisMois), "objectif du mois : réservés et servis")
    verifier((await bloc.getAttribute("data-prevision")) === String(servisMois), "prévision égale aux servis sans réservation à venir")
    verifier((await bloc.locator("[data-pill]").count()) === 48, "48 segments dans la barre")

    const midi = mgr.locator('[data-testid="aujourdhui"] tr[data-service="LUNCH"]')
    verifier((await midi.getAttribute("data-reserves")) === "3" && (await midi.getAttribute("data-servis")) === "2", "déjeuner du jour : 3 réservés, 2 servis")
    verifier((await mgr.locator('[data-testid="aujourdhui"] tr[data-service="BREAKFAST"]').getAttribute("data-reserves")) === "0", "petit-déjeuner du jour vide")

    const issue = mgr.locator('[data-testid="fin-reservations"]')
    const lire = (a) => issue.getAttribute("data-" + a)
    verifier((await lire("places")) === "8", "8 réservations placées")
    verifier((await lire("servis")) === "5" && (await lire("annulees")) === "1" && (await lire("absents")) === "1" && (await lire("avenir")) === "1", "issue : 5 servies, 1 annulée, 1 absente, 1 à venir")
    verifier((await lire("hors")) === "1", "1 repas hors réservation")
    verifier((await issue.innerText()).includes("62,5"), "pourcentage des repas servis affiché (5 sur 8)")
  })

  await etape("Filtre de période : aujourd'hui et 30 jours", async () => {
    await mgr.locator('[data-periode="jour"]').click()
    await mgr.waitForURL((u) => u.searchParams.get("periode") === "jour")
    await attendre(async () => (await kpi(mgr, "kpi-servis")) === "2", "2 repas servis aujourd'hui")
    verifier((await kpi(mgr, "kpi-taux")) === "67" && (await kpi(mgr, "kpi-cout")) === "400", "taux 67 % et coût 400 aujourd'hui")
    await mgr.locator('[data-periode="30j"]').click()
    await mgr.waitForURL((u) => u.searchParams.get("periode") === "30j")
    await attendre(async () => (await kpi(mgr, "kpi-servis")) === "5", "5 repas servis sur 30 jours")
    verifier((await kpi(mgr, "kpi-taux")) === "71" && (await kpi(mgr, "kpi-cout")) === "1000", "taux 71 % et coût 1000 sur 30 jours")
    verifier((await mgr.locator('[data-testid="kpi-servis"]').innerText()).includes("nouveau"), "pas de période précédente à comparer")
  })

  await etape("Rôles : le caissier ne voit pas les coûts, le parent n'a aucun tableau d'analyse", async () => {
    const c = await connecter(BASE, CAISSE, mdpCaisse)
    await c.locator('[data-testid="kpis"]').waitFor()
    verifier((await c.locator('[data-testid="kpi-cout"]').count()) === 0, "pas de coût pour le caissier")
    verifier((await c.locator('[data-testid="kpi-hors"]').count()) === 1, "le caissier voit les repas hors réservation")
    await c.context().close()
    const p = await connecter(BASE, PARENT, mdpParent)
    await p.locator('[data-testid="modules"]').waitFor()
    verifier((await p.locator('[data-testid="kpis"]').count()) === 0, "pas d'indicateurs pour le parent")
    await p.context().close()
  })

  await mgr.context().close()
}

let code = 0
try {
  await principal()
} catch (e) {
  code = 1
  console.log("  ERREUR : " + (e && e.message ? e.message : e))
}
await terminer(nettoyer, "DASHBOARD", code)