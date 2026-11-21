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

const PORT = 3124
const BASE = "http://localhost:" + PORT
const mdpP1 = secret()
const mdpP2 = secret()
const mdpGest = secret()
const P1 = "test-fv-parent@miam.test"
const P2 = "test-fv-parent2@miam.test"
const GEST = "test-fv-gest@miam.test"
const EMAILS = [P1, P2, GEST]
const iso = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)
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
  const E = await db.etablissement.create({ data: { code: "ZZ-FV", name: "ZZ Ecole Avis Parents", type: "SCHOOL", prepaye: true } })
  await db.tarif.create({ data: { etablissementId: E.id, service: "LUNCH", prix: 500 } })
  const creerUser = (email, name, role, mdp) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  const uP1 = await creerUser(P1, "Test Fv Parent", "PARENT", mdpP1)
  await creerUser(P2, "Test Fv Parent2", "PARENT", mdpP2)
  await creerUser(GEST, "Test Fv Gest", "MANAGER", mdpGest)
  const riz = await db.plat.create({ data: { etablissementId: E.id, name: "ZZ Riz" } })
  const poulet = await db.plat.create({ data: { etablissementId: E.id, name: "ZZ Poulet" } })
  const horsMenu = await db.plat.create({ data: { etablissementId: E.id, name: "ZZ Plat Hors Menu" } })
  const inscrit = (n, email) => db.inscrit.create({ data: { etablissementId: E.id, matricule: "ZZV-" + n, firstName: "Fa", lastName: "Nom" + n, badge: "ZZVBADGE-" + n, tuteurs: { create: [{ name: "Tuteur " + n, email }] } } })
  const f1 = await inscrit(1, P1)
  const f2 = await inscrit(2, P2)
  const menu = (jour, plats) => db.menu.create({ data: { etablissementId: E.id, date: dateDb(jour), service: "LUNCH", statut: "PUBLISHED", plats: { create: plats.map((p) => ({ platId: p.id })) } } })
  await menu(iso(0), [riz, poulet])
  await menu(iso(-1), [riz])
  await menu(iso(-3), [riz])
  await menu(iso(-20), [riz])
  const resa = (inscritId, jour, servi) => db.reservation.create({ data: { etablissementId: E.id, inscritId, date: dateDb(jour), service: "LUNCH", statut: "BOOKED", servedAt: servi ? new Date() : null } })
  await resa(f1.id, iso(0), true)
  await resa(f1.id, iso(-3), true)
  await resa(f1.id, iso(-1), false)
  await resa(f1.id, iso(-20), true)
  await resa(f2.id, iso(0), true)

  process.env.CRON_SECRET = secret() + secret()
  await demarrer(BASE, PORT)
  const parent = await connecter(BASE, P1, mdpP1)
  const perime = await connecter(BASE, P1, mdpP1)
  const texte = (p, t) => p.getByText(t).filter({ visible: true }).first()
  const ouvrir = async (p, chemin, testid) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
  }
  const carte = (p, jour) => p.locator('[data-testid="repas-a-noter"][data-date="' + jour + '"][data-service="LUNCH"]')
  const envoyer = async (p, jour, { note = "", plat = "", commentaire = "" }) => {
    const f = carte(p, jour).locator("form")
    await f.evaluate((el) => { el.noValidate = true })
    await f.locator('select[name="note"]').selectOption(note)
    await f.locator('select[name="platId"]').selectOption(plat)
    await f.locator('input[name="commentaire"]').fill(commentaire)
    await f.getByRole("button", { name: "Envoyer mon avis" }).click()
  }

  await etape("Cartes : seuls les repas servis des 14 derniers jours peuvent être notés", async () => {
    await ouvrir(parent, "/famille/" + f1.id, "fiche-enfant")
    await parent.locator('[data-testid="avis-repas"]').waitFor()
    verifier((await parent.locator('[data-testid="repas-a-noter"]').count()) === 2, "deux repas à noter")
    verifier((await carte(parent, iso(0)).count()) === 1 && (await carte(parent, iso(-3)).count()) === 1, "le repas du jour et celui d'il y a trois jours")
    verifier((await carte(parent, iso(-1)).count()) === 0, "un repas réservé mais non servi n'est pas proposé")
    verifier((await carte(parent, iso(-20)).count()) === 0, "un repas trop ancien n'est pas proposé")
    await ouvrir(perime, "/famille/" + f1.id, "fiche-enfant")
    await carte(perime, iso(0)).locator("form").waitFor()
  })

  await etape("Envoi : note, commentaire et plat hors menu refusés ; avis enregistré avec le plat et le nom du parent", async () => {
    await envoyer(parent, iso(0), { note: "" })
    await texte(parent, "Note invalide").waitFor()
    await envoyer(parent, iso(0), { note: "4", commentaire: "x".repeat(501) })
    await texte(parent, "Commentaire trop long").waitFor()
    const f = carte(parent, iso(0)).locator("form")
    await f.locator('select[name="platId"]').evaluate((el, id) => {
      const o = document.createElement("option")
      o.value = id
      o.text = "Plat hors menu"
      el.appendChild(o)
    }, horsMenu.id)
    await envoyer(parent, iso(0), { note: "4", plat: horsMenu.id })
    await texte(parent, "ne figurait pas au menu").waitFor()
    verifier((await db.avis.count({ where: { etablissementId: E.id } })) === 0, "rien n'est enregistré par les refus")
    await envoyer(parent, iso(0), { note: "4", plat: poulet.id, commentaire: "Très bon poulet" })
    await attendre(async () => (await db.avis.count({ where: { etablissementId: E.id } })) === 1, "avis enregistré")
    const a = await db.avis.findFirst({ where: { etablissementId: E.id } })
    verifier(a.note === 4 && a.platNom === "ZZ Poulet" && a.source === "PARENT" && a.auteur === "Parent de Fa Nom1" && a.commentaire === "Très bon poulet" && a.service === "LUNCH", "avis complet")
    await ouvrir(parent, "/famille/" + f1.id, "fiche-enfant")
    verifier((await carte(parent, iso(0)).getAttribute("data-note")) === "oui", "la carte indique que l'avis est donné")
    verifier((await carte(parent, iso(0)).locator("form").count()) === 0, "plus de formulaire sur un repas noté")
    verifier((await carte(parent, iso(-3)).locator("form").count()) === 1, "l'autre repas reste à noter")
  })

  await etape("Doublon : un formulaire resté ouvert ne peut pas noter deux fois le même repas", async () => {
    await envoyer(perime, iso(0), { note: "5" })
    await texte(perime, "déjà été donné").waitFor()
    verifier((await db.avis.count({ where: { etablissementId: E.id } })) === 1, "toujours un seul avis")
  })

  await etape("Direction : l'avis du parent apparaît dans Satisfaction, avec son audit", async () => {
    const gest = await connecter(BASE, GEST, mdpGest)
    await ouvrir(gest, "/satisfaction?vue=avis", "satisfaction-page")
    const ligne = gest.locator('tr[data-avis][data-plat="ZZ Poulet"][data-note="4"]')
    verifier((await ligne.count()) === 1, "ligne de l'avis visible")
    verifier((await ligne.innerText()).includes("Parent de Fa Nom1"), "le nom du parent est affiché")
    verifier(!!(await db.auditLog.findFirst({ where: { action: "AVIS_PARENT", userId: uP1.id } })), "audit AVIS_PARENT")
  })

  await etape("Isolation : un parent ne voit ni ne note les repas des enfants d'une autre famille", async () => {
    const p2 = await connecter(BASE, P2, mdpP2)
    await p2.goto(BASE + "/famille/" + f1.id, { waitUntil: "load" })
    await attendre(async () => new URL(p2.url()).pathname === "/famille", "fiche d'un autre enfant refusée")
    await ouvrir(p2, "/famille/" + f2.id, "fiche-enfant")
    verifier((await p2.locator('[data-testid="repas-a-noter"]').count()) === 1, "une seule carte pour son enfant")
    await envoyer(p2, iso(0), { note: "3" })
    await attendre(async () => (await db.avis.count({ where: { etablissementId: E.id } })) === 2, "avis du second parent")
    const b = await db.avis.findFirst({ where: { etablissementId: E.id, auteur: "Parent de Fa Nom2" } })
    verifier(b && b.note === 3 && b.platNom === null, "avis du second parent rattaché à son enfant, sans plat")
    verifier((await db.avis.count({ where: { etablissementId: E.id, auteur: "Parent de Fa Nom1" } })) === 1, "l'avis du premier parent est intact")
  })

  await terminer(nettoyer, "FAMILLE AVIS", 0)
}

principal().catch(async (e) => {
  console.error("Echec : " + (e && e.message ? e.message : e))
  await terminer(nettoyer, "FAMILLE AVIS", 1)
})