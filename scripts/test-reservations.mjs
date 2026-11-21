import "dotenv/config"
import { randomBytes } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"

import { PrismaPg } from "@prisma/adapter-pg"
import * as bcryptModule from "bcryptjs"
import Redis from "ioredis"
import { chromium } from "playwright"

import { PrismaClient } from "../src/generated/prisma/client.ts"

const bcrypt = bcryptModule.default ?? bcryptModule
const PORT = 3106
const BASE = "http://localhost:" + PORT
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const redis = new Redis(process.env.REDIS_URL)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const secret = () => randomBytes(8).toString("hex") + "Zz9"
const mdpCaisse = secret()
const mdpChef = secret()
const mdpMgrB = secret()
const CAISSE = "test-rs-caisse@miam.test"
const CHEF = "test-rs-chef@miam.test"
const MGRB = "test-rs-mgrb@miam.test"
const EMAILS = [CAISSE, CHEF, MGRB]

const jourDecale = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
const AUJ = jourDecale(0)
const HIER = jourDecale(-1)
const DEMAIN = jourDecale(1)
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
  const p = await (await navigateur.newContext({ locale: "fr-FR", viewport: { width: 1440, height: 900 } })).newPage()
  p.setDefaultTimeout(30000)
  return p
}

async function ouvrir(chemin, p) {
  await p.goto(BASE + chemin, { waitUntil: "load" })
  await p.waitForLoadState("networkidle").catch(() => {})
  await p.locator('[data-testid="jour"]').waitFor()
  await sleep(300)
}

async function connecter(email, mdp) {
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

const alerte = (p, texte) => p.locator('p[role="alert"]').filter({ hasText: texte }).waitFor()
const statut = (p, texte) => p.locator('[role="status"]').filter({ hasText: texte }).waitFor()

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { OR: [{ userEmail: { in: EMAILS } }, { details: { contains: "ZZ" } }] } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const IA = await db.etablissement.create({ data: { code: "ZZ-RA", name: "ZZ Ecole RA", type: "SCHOOL" } })
  const IB = await db.etablissement.create({ data: { code: "ZZ-RB", name: "ZZ Ecole RB", type: "SCHOOL" } })
  const creerUser = (email, name, role, mdp, etab) =>
    db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: etab.id }] } } })
  await creerUser(CAISSE, "Test Rs Caisse", "CASHIER", mdpCaisse, IA)
  await creerUser(CHEF, "Test Rs Chef", "CHEF", mdpChef, IA)
  await creerUser(MGRB, "Test Rs MgrB", "MANAGER", mdpMgrB, IB)

  const arachide = await db.referentiel.create({ data: { etablissementId: IA.id, kind: "ALLERGIE", name: "ZZ Arachide" } })
  const groupe = await db.referentiel.create({ data: { etablissementId: IA.id, kind: "GROUPE", name: "ZZ Groupe R" } })
  const inscrit = (num, statutIns, extra = {}) =>
    db.inscrit.create({
      data: { etablissementId: IA.id, matricule: "ZZR-" + num, firstName: "Rs", lastName: "Nom" + num, badge: "ZZR" + String(num).padStart(13, "0"), statut: statutIns, ...extra },
    })
  await inscrit(1, "ACTIVE", { allergies: { create: [{ allergieId: arachide.id }] } })
  await inscrit(2, "ACTIVE")
  await inscrit(3, "SUSPENDED")
  await inscrit(4, "ACTIVE", { groupeId: groupe.id })
  await inscrit(5, "ACTIVE", { groupeId: groupe.id })

  const plat = await db.plat.create({ data: { etablissementId: IA.id, name: "ZZ Plat R", portions: 1 } })
  await db.menu.create({ data: { etablissementId: IA.id, date: dateUtc(AUJ), service: "LUNCH", statut: "PUBLISHED", plats: { create: [{ platId: plat.id }] } } })
  await db.menu.create({ data: { etablissementId: IA.id, date: dateUtc(AUJ), service: "DINNER", statut: "DRAFT", plats: { create: [{ platId: plat.id }] } } })

  const resa = (matricule, service = "LUNCH") => db.reservation.findFirst({ where: { etablissementId: IA.id, service, date: dateUtc(AUJ), inscrit: { matricule } } })
  const carte = (p, s) => p.locator('[data-service="' + s + '"]')
  const compteurs = (p, s, attr) => carte(p, s).locator('[data-testid="compteurs-' + s + '"]').getAttribute(attr)
  const ligne = (p, matricule) => carte(p, "LUNCH").locator('tr[data-matricule="' + matricule + '"]')

  serveur = spawn("npx", ["next", "start", "-p", String(PORT)], { shell: true, cwd: process.cwd(), env: process.env, stdio: "ignore" })
  await attendre(async () => {
    try {
      return (await fetch(BASE + "/api/sante")).ok
    } catch {
      return false
    }
  }, "demarrage du serveur", 60000)
  navigateur = await chromium.launch()
  const caisse = await connecter(CAISSE, mdpCaisse)

  await etape("Réservation par matricule : fermée sans menu publié, inconnu / suspendu / doublon refusés", async () => {
    await ouvrir("/reservations", caisse)
    for (const s of ["BREAKFAST", "SNACK", "DINNER"]) {
      verifier((await carte(caisse, s).locator('[data-testid="form-reserver"]').count()) === 0, "pas de réservation sans menu publié : " + s)
    }
    const reserver = async (matricule) => {
      await carte(caisse, "LUNCH").locator("#res-matricule-LUNCH").fill(matricule)
      await carte(caisse, "LUNCH").getByRole("button", { name: "Réserver", exact: true }).click()
    }
    await reserver("ZZR-9")
    await alerte(caisse, "Matricule inconnu")
    await reserver("ZZR-3")
    await alerte(caisse, "pas actif")
    await reserver("ZZR-1")
    await statut(caisse, "Réservation enregistrée")
    const r1 = await attendre(() => resa("ZZR-1"), "réservation créée")
    verifier(r1.statut === "BOOKED" && r1.servedAt === null, "réservation en attente de service")
    await reserver("ZZR-1")
    await alerte(caisse, "Déjà réservé")
    await attendre(async () => (await compteurs(caisse, "LUNCH", "data-reserves")) === "1", "compteur à 1")
  })

  await etape("Réservation d'un groupe entier, relance sans doublon, effectifs par allergie", async () => {
    await carte(caisse, "LUNCH").locator("#res-groupe-LUNCH").selectOption(groupe.id)
    await carte(caisse, "LUNCH").getByRole("button", { name: "Réserver le groupe" }).click()
    await statut(caisse, "2 réservation")
    await attendre(async () => (await db.reservation.count({ where: { etablissementId: IA.id, service: "LUNCH", date: dateUtc(AUJ), statut: "BOOKED" } })) === 3, "3 réservations au total")
    await carte(caisse, "LUNCH").locator("#res-groupe-LUNCH").selectOption(groupe.id)
    await carte(caisse, "LUNCH").getByRole("button", { name: "Réserver le groupe" }).click()
    await statut(caisse, "Aucune nouvelle")
    verifier((await db.reservation.count({ where: { etablissementId: IA.id } })) === 3, "aucun doublon créé")
    await attendre(async () => (await compteurs(caisse, "LUNCH", "data-reserves")) === "3", "compteur à 3")
    const stat = carte(caisse, "LUNCH").locator('li[data-stat="allergie:ZZ Arachide"]')
    await stat.waitFor()
    verifier((await stat.innerText()).includes(": 1"), "un inscrit réservé est allergique à l'arachide")
  })

  await etape("Annulation, réactivation, pointage, annulation du pointage", async () => {
    await ligne(caisse, "ZZR-5").getByRole("button", { name: "Annuler la réservation" }).click()
    await attendre(async () => (await resa("ZZR-5"))?.statut === "CANCELLED", "réservation annulée")
    await attendre(async () => (await compteurs(caisse, "LUNCH", "data-reserves")) === "2", "compteur à 2")
    await carte(caisse, "LUNCH").locator("#res-matricule-LUNCH").fill("ZZR-5")
    await carte(caisse, "LUNCH").getByRole("button", { name: "Réserver", exact: true }).click()
    await attendre(async () => (await resa("ZZR-5"))?.statut === "BOOKED", "réservation réactivée")
    await attendre(async () => (await compteurs(caisse, "LUNCH", "data-reserves")) === "3", "compteur de nouveau à 3")

    await ligne(caisse, "ZZR-1").getByRole("button", { name: "Pointer", exact: true }).click()
    await attendre(async () => (await resa("ZZR-1"))?.servedAt !== null, "repas pointé")
    await ligne(caisse, "ZZR-1").locator('[data-etat="servi"]').waitFor()
    verifier((await ligne(caisse, "ZZR-1").getByRole("button", { name: "Annuler la réservation" }).count()) === 0, "un repas servi ne s'annule pas")
    await attendre(async () => (await compteurs(caisse, "LUNCH", "data-servis")) === "1", "1 servi")
    await ligne(caisse, "ZZR-1").getByRole("button", { name: "Annuler le pointage" }).click()
    await attendre(async () => (await resa("ZZR-1"))?.servedAt === null, "pointage annulé")
    await attendre(async () => (await compteurs(caisse, "LUNCH", "data-servis")) === "0", "0 servi")
    await ligne(caisse, "ZZR-1").getByRole("button", { name: "Pointer", exact: true }).click()
    await attendre(async () => (await resa("ZZR-1"))?.servedAt !== null, "repas repointé")
  })

  await etape("Dates : le passé est en lecture seule, le lendemain sans menu est fermé", async () => {
    await ouvrir("/reservations?date=" + HIER, caisse)
    verifier((await caisse.locator('[data-testid="form-reserver"]').count()) === 0, "pas de réservation sur une date passée")
    await ouvrir("/reservations?date=" + DEMAIN, caisse)
    verifier((await caisse.locator('[data-testid="form-reserver"]').count()) === 0, "pas de réservation sans menu publié le lendemain")
    verifier((await compteurs(caisse, "LUNCH", "data-reserves")) === "0", "aucune réservation le lendemain")
    await ouvrir("/reservations", caisse)
  })

  await etape("Droits et isolation : le chef consulte sans modifier, l'autre établissement ne voit rien", async () => {
    const chef = await connecter(CHEF, mdpChef)
    await ouvrir("/reservations", chef)
    await ligne(chef, "ZZR-1").waitFor()
    verifier((await chef.locator('[data-testid="form-reserver"]').count()) === 0, "pas de formulaire pour le chef")
    verifier((await chef.locator("tbody button").count()) === 0, "pas de bouton d'action pour le chef")
    verifier((await compteurs(chef, "LUNCH", "data-reserves")) === "3", "le chef voit les effectifs")
    await chef.context().close()

    const b = await connecter(MGRB, mdpMgrB)
    await ouvrir("/reservations", b)
    verifier((await b.locator("tr[data-matricule]").count()) === 0, "l'autre établissement ne voit aucune réservation")
    verifier((await b.locator('[data-testid="form-reserver"]').count()) === 0, "pas de menu publié dans l'autre établissement")
    await b.context().close()
  })

  await etape("Audit complet des actions", async () => {
    for (const action of ["RESERVATION_CREATED", "RESERVATION_GROUP", "RESERVATION_CANCELLED", "RESERVATION_SERVED", "RESERVATION_UNSERVED"]) {
      verifier(!!(await db.auditLog.findFirst({ where: { action } })), "audit " + action + " attendu")
    }
  })

  await caisse.context().close()
}

let code = 0
try {
  await principal()
} catch (e) {
  code = 1
  console.log("  ERREUR : " + (e && e.message ? e.message : e))
} finally {
  if (navigateur) await navigateur.close().catch(() => {})
  if (serveur) {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(serveur.pid), "/T", "/F"])
    else serveur.kill()
  }
  await nettoyer().catch((e) => console.log("Nettoyage incomplet : " + e.message))
  await db.$disconnect().catch(() => {})
  redis.disconnect()
}

const reussies = resultats.filter((r) => r.ok).length
console.log("")
console.log("Resultat : " + reussies + " / " + resultats.length + " etapes reussies")
console.log(code === 0 ? "=== TESTS RESERVATIONS OK ===" : "=== TESTS RESERVATIONS ECHEC ===")
process.exit(code)