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
const PORT = 3107
const BASE = "http://localhost:" + PORT
const mdpCaisse = secret()
const mdpChef = secret()
const mdpMgr = secret()
const mdpMgrB = secret()
const CAISSE = "test-sv-caisse@miam.test"
const CHEF = "test-sv-chef@miam.test"
const MGR = "test-sv-mgr@miam.test"
const MGRB = "test-sv-mgrb@miam.test"
const EMAILS = [CAISSE, CHEF, MGR, MGRB]

const alerteTexte = (p, statut, texte) => p.locator('[data-testid="resultat-scan"][data-statut="' + statut + '"]').filter({ hasText: texte }).waitFor()

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { OR: [{ userEmail: { in: EMAILS } }, { details: { contains: "ZZ" } }] } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const IA = await db.etablissement.create({ data: { code: "ZZ-SA", name: "ZZ Ecole SA", type: "SCHOOL" } })
  const IB = await db.etablissement.create({ data: { code: "ZZ-SB", name: "ZZ Ecole SB", type: "SCHOOL" } })
  const creerUser = (email, name, role, mdp, etab) =>
    db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: etab.id }] } } })
  await creerUser(CAISSE, "Test Sv Caisse", "CASHIER", mdpCaisse, IA)
  await creerUser(CHEF, "Test Sv Chef", "CHEF", mdpChef, IA)
  await creerUser(MGR, "Test Sv Mgr", "MANAGER", mdpMgr, IA)
  await creerUser(MGRB, "Test Sv MgrB", "MANAGER", mdpMgrB, IB)

  const arachide = await db.referentiel.create({ data: { etablissementId: IA.id, kind: "ALLERGIE", name: "ZZ Arachide" } })
  const badge = (n) => "ZZS" + String(n).padStart(13, "0")
  const inscrit = (n, statutIns, extra = {}) =>
    db.inscrit.create({ data: { etablissementId: IA.id, matricule: "ZZS-" + n, firstName: "Sv", lastName: "Nom" + n, badge: badge(n), statut: statutIns, ...extra } })
  const s1 = await inscrit(1, "ACTIVE", { allergies: { create: [{ allergieId: arachide.id }] } })
  const s2 = await inscrit(2, "ACTIVE")
  await inscrit(3, "SUSPENDED")
  const s4 = await inscrit(4, "ACTIVE")
  await db.menu.create({ data: { etablissementId: IA.id, date: dateUtc(AUJ), service: "LUNCH", statut: "PUBLISHED" } })
  await db.menu.create({ data: { etablissementId: IA.id, date: dateUtc(AUJ), service: "DINNER", statut: "DRAFT" } })
  await db.menu.create({ data: { etablissementId: IB.id, date: dateUtc(AUJ), service: "LUNCH", statut: "PUBLISHED" } })
  for (const i of [s1, s4]) await db.reservation.create({ data: { etablissementId: IA.id, inscritId: i.id, date: dateUtc(AUJ), service: "LUNCH" } })

  const resa = (inscritId) => db.reservation.findFirst({ where: { etablissementId: IA.id, inscritId, date: dateUtc(AUJ), service: "LUNCH" } })
  const ouvrir = async (p, chemin) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="service-page"]').waitFor()
    await sleep(300)
  }
  const scanner = async (p, code) => {
    await p.locator("#scan-code").fill(code)
    await p.getByRole("button", { name: "Valider" }).click()
  }
  const compteur = (p, attr) => p.locator('[data-testid="compteurs-service"]').getAttribute(attr)

  await demarrer(BASE, PORT)
  const caisse = await connecter(BASE, CAISSE, mdpCaisse)

  await etape("Scan d'un badge réservé : servi, allergies en alerte, compteurs à jour", async () => {
    await ouvrir(caisse, "/service?service=LUNCH")
    await scanner(caisse, badge(1))
    await alerteTexte(caisse, "SERVI", "Nom1")
    await caisse.locator('[data-testid="alerte-allergies"]').filter({ hasText: "ZZ Arachide" }).waitFor()
    const r = await attendre(async () => {
      const x = await resa(s1.id)
      return x && x.servedAt ? x : null
    }, "repas pointé en base")
    verifier(r.walkIn === false, "repas réservé, pas une exception")
    await attendre(async () => (await compteur(caisse, "data-servis")) === "1", "compteur servis à 1")
    verifier((await compteur(caisse, "data-reserves")) === "2", "2 réservés")
    await caisse.locator('[data-testid="derniers-passages"] li[data-matricule="ZZS-1"]').waitFor()
  })

  await etape("Second passage signalé, badge inconnu, inscrit non actif, repli par matricule", async () => {
    await scanner(caisse, badge(1))
    await alerteTexte(caisse, "DEJA", "Déjà servi")
    await scanner(caisse, "ZZNOPE")
    await alerteTexte(caisse, "INCONNU", "inconnu")
    await scanner(caisse, badge(3))
    await alerteTexte(caisse, "INACTIF", "pas actif")
    await scanner(caisse, "ZZS-4")
    await alerteTexte(caisse, "SERVI", "Nom4")
    await attendre(async () => (await compteur(caisse, "data-servis")) === "2", "compteur servis à 2")
  })

  await etape("Sans réservation : refus puis exception explicite, tracée et comptée à part", async () => {
    await scanner(caisse, badge(2))
    await alerteTexte(caisse, "SANS_RESERVATION", "Aucune réservation")
    verifier(!(await resa(s2.id)), "rien n'est écrit tant que l'exception n'est pas confirmée")
    await caisse.getByRole("button", { name: "Servir quand même" }).click()
    await alerteTexte(caisse, "SERVI", "hors réservation")
    const r = await attendre(async () => {
      const x = await resa(s2.id)
      return x && x.servedAt ? x : null
    }, "exception enregistrée")
    verifier(r.walkIn === true && r.statut === "BOOKED", "repas marqué hors réservation")
    await attendre(async () => (await compteur(caisse, "data-hors")) === "1", "1 repas hors réservation")
  })

  await etape("Service fermé : menu non publié", async () => {
    await ouvrir(caisse, "/service?service=DINNER")
    await scanner(caisse, badge(1))
    await alerteTexte(caisse, "FERME", "fermé")
    verifier((await db.reservation.count({ where: { etablissementId: IA.id, service: "DINNER" } })) === 0, "aucune écriture sur un service fermé")
  })

  await etape("Droits et isolation : le chef consulte seulement, un badge d'un autre établissement est inconnu", async () => {
    const chef = await connecter(BASE, CHEF, mdpChef)
    await ouvrir(chef, "/service?service=LUNCH")
    verifier((await chef.locator("#scan-code").count()) === 0, "pas de scan pour le chef")
    verifier((await compteur(chef, "data-servis")) === "3", "le chef voit l'avancement")
    await chef.context().close()

    const b = await connecter(BASE, MGRB, mdpMgrB)
    await ouvrir(b, "/service?service=LUNCH")
    await scanner(b, badge(1))
    await alerteTexte(b, "INCONNU", "inconnu")
    await b.context().close()
  })

  await etape("Planche de badges : QR pour les inscrits actifs, réservée aux responsables", async () => {
    const m = await connecter(BASE, MGR, mdpMgr)
    await m.goto(BASE + "/inscrits/badges", { waitUntil: "load" })
    await m.locator('[data-testid="planche-badges"]').waitFor()
    await attendre(async () => (await m.locator("img[data-qr]").count()) === 3, "3 QR pour les 3 inscrits actifs")
    verifier((await m.locator('[data-badge="ZZS-3"]').count()) === 0, "l'inscrit suspendu n'a pas de badge imprimé")
    await m.context().close()
    await caisse.goto(BASE + "/inscrits/badges", { waitUntil: "load" })
    await attendre(() => new URL(caisse.url()).pathname === "/", "le caissier ne peut pas imprimer les badges")
  })

  await etape("Audit des passages et des exceptions", async () => {
    for (const action of ["SERVICE_SERVED", "SERVICE_WALKIN"]) verifier(!!(await db.auditLog.findFirst({ where: { action } })), "audit " + action + " attendu")
  })

  await caisse.context().close()
}

let code = 0
try {
  await principal()
} catch (e) {
  code = 1
  console.log("  ERREUR : " + (e && e.message ? e.message : e))
}
await terminer(nettoyer, "SERVICE", code)