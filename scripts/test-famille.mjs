import "dotenv/config"
import http from "node:http"
import { createHmac, randomBytes } from "node:crypto"
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
const D1 = jourDecale(1)
const D2 = jourDecale(2)

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

const PORT = 3110
const MOCK_PORT = 3911
const BASE = "http://localhost:" + PORT
const CLE = "sk_test_zz_famille"
const mdpParent = secret()
const mdpParent2 = secret()
const mdpCaisse = secret()
const PARENT = "test-fa-parent@miam.test"
const PARENT2 = "test-fa-parent2@miam.test"
const CAISSE = "test-fa-caisse@miam.test"
const EMAILS = [PARENT, PARENT2, CAISSE]

// Faux serveur Paystack : meme contrat que l'API (initialisation, page de paiement, verification).
const mock = { initialises: {}, verif: {} }
const serveurMock = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:" + MOCK_PORT)
  const json = (code, obj) => {
    res.writeHead(code, { "content-type": "application/json" })
    res.end(JSON.stringify(obj))
  }
  if (url.pathname.startsWith("/pay/")) {
    const ref = decodeURIComponent(url.pathname.slice(5))
    const init = mock.initialises[ref]
    if (!init) {
      res.writeHead(404)
      return res.end("introuvable")
    }
    res.writeHead(302, { location: init.callback_url + "?reference=" + encodeURIComponent(ref) + "&trxref=" + encodeURIComponent(ref) })
    return res.end()
  }
  if (req.headers.authorization !== "Bearer " + CLE) return json(401, { status: false, message: "Invalid key" })
  if (req.method === "POST" && url.pathname === "/transaction/initialize") {
    let corps = ""
    req.on("data", (c) => (corps += c))
    req.on("end", () => {
      const b = JSON.parse(corps)
      mock.initialises[b.reference] = b
      json(200, { status: true, message: "Authorization URL created", data: { authorization_url: "http://127.0.0.1:" + MOCK_PORT + "/pay/" + encodeURIComponent(b.reference), access_code: "ac", reference: b.reference } })
    })
    return
  }
  if (req.method === "GET" && url.pathname.startsWith("/transaction/verify/")) {
    const ref = decodeURIComponent(url.pathname.slice("/transaction/verify/".length))
    const v = mock.verif[ref] ?? (mock.initialises[ref] ? { status: "success", amount: mock.initialises[ref].amount } : null)
    if (!v) return json(404, { status: false, message: "Transaction reference not found" })
    return json(200, { status: true, message: "Verification successful", data: { status: v.status, amount: v.amount, currency: "XOF", reference: ref, channel: "mobile_money" } })
  }
  json(404, { status: false, message: "Not found" })
})

const signer = (corps) => createHmac("sha512", CLE).update(corps).digest("hex")
const webhook = (ref, signature) => {
  const corps = JSON.stringify({ event: "charge.success", data: { reference: ref } })
  const entetes = { "content-type": "application/json" }
  if (signature === "ok") entetes["x-paystack-signature"] = signer(corps)
  else if (signature) entetes["x-paystack-signature"] = signature
  return fetch(BASE + "/api/paystack/webhook", { method: "POST", headers: entetes, body: corps })
}

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { OR: [{ userEmail: { in: EMAILS } }, { details: { contains: "ZZ" } }] } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  await new Promise((r) => serveurMock.listen(MOCK_PORT, "127.0.0.1", r))
  process.env.PAYSTACK_SECRET_KEY = CLE
  process.env.PAYSTACK_API_URL = "http://127.0.0.1:" + MOCK_PORT
  process.env.APP_URL = BASE

  const IA = await db.etablissement.create({ data: { code: "ZZ-FA", name: "ZZ Ecole FA", type: "SCHOOL", prepaye: true } })
  await db.tarif.create({ data: { etablissementId: IA.id, service: "LUNCH", prix: 500 } })
  const creerUser = (email, name, role, mdp) =>
    db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: IA.id }] } } })
  const parentUser = await creerUser(PARENT, "Test Fa Parent", "PARENT", mdpParent)
  await creerUser(PARENT2, "Test Fa Parent2", "PARENT", mdpParent2)
  await creerUser(CAISSE, "Test Fa Caisse", "CASHIER", mdpCaisse)

  const arachide = await db.referentiel.create({ data: { etablissementId: IA.id, kind: "ALLERGIE", name: "ZZ Arachide" } })
  const badge = (n) => "ZZF" + String(n).padStart(13, "0")
  const inscrit = (n, tuteurEmail, extra = {}) =>
    db.inscrit.create({ data: { etablissementId: IA.id, matricule: "ZZF-" + n, firstName: "Fa", lastName: "Nom" + n, badge: badge(n), tuteurs: { create: [{ name: "Tuteur " + n, email: tuteurEmail }] }, ...extra } })
  const f1 = await inscrit(1, PARENT.toUpperCase(), { allergies: { create: [{ allergieId: arachide.id }] } })
  const f2 = await inscrit(2, PARENT)
  const f3 = await inscrit(3, PARENT2)

  const ing = await db.ingredient.create({ data: { etablissementId: IA.id, name: "ZZ Arachide brute", unit: "g", allergens: { create: [{ allergieId: arachide.id }] } } })
  const mafe = await db.plat.create({ data: { etablissementId: IA.id, name: "ZZ Mafé", ingredients: { create: [{ ingredientId: ing.id, quantity: "100" }] } } })
  const riz = await db.plat.create({ data: { etablissementId: IA.id, name: "ZZ Riz" } })
  await db.menu.create({ data: { etablissementId: IA.id, date: dateUtc(AUJ), service: "LUNCH", statut: "PUBLISHED", plats: { create: [{ platId: riz.id }] } } })
  await db.menu.create({ data: { etablissementId: IA.id, date: dateUtc(D1), service: "LUNCH", statut: "PUBLISHED", plats: { create: [{ platId: mafe.id }] } } })
  await db.menu.create({ data: { etablissementId: IA.id, date: dateUtc(D2), service: "LUNCH", statut: "DRAFT" } })

  const solde = async (id) => (await db.inscrit.findUnique({ where: { id } })).solde
  const ouvrir = async (p, chemin, testid) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]').waitFor()
    await sleep(300)
  }
  const ligne = (p, jour) => p.locator('[data-testid="repas"][data-date="' + jour + '"][data-service="LUNCH"]')
  const cheminAttendu = (p, chemin, message) => attendre(() => new URL(p.url()).pathname === chemin, message)

  await demarrer(BASE, PORT)
  const parent = await connecter(BASE, PARENT, mdpParent)

  await etape("Espace parent : menu dédié, seulement ses enfants (e-mail insensible à la casse), autres comptes refusés", async () => {
    verifier((await parent.locator('[data-testid="menu-principal"] a[href="/famille"]').count()) === 1, "entrée « Mes enfants » dans le menu")
    await ouvrir(parent, "/famille", "liste-enfants")
    verifier((await parent.locator('[data-testid="enfant-card"]').count()) === 2, "deux enfants rattachés")
    verifier((await parent.locator('[data-testid="enfant-card"][data-matricule="ZZF-3"]').count()) === 0, "l'enfant d'une autre famille est invisible")
    await parent.goto(BASE + "/famille/" + f3.id, { waitUntil: "load" })
    await cheminAttendu(parent, "/famille", "fiche d'un autre enfant refusée")
    const caisse = await connecter(BASE, CAISSE, mdpCaisse)
    await caisse.goto(BASE + "/famille", { waitUntil: "load" })
    await cheminAttendu(caisse, "/", "le personnel n'accède pas à l'espace parent")
    await caisse.context().close()
  })

  await etape("Réservation par le parent : allergène signalé, brouillon fermé, réserver puis annuler", async () => {
    await ouvrir(parent, "/famille/" + f1.id, "fiche-enfant")
    const d1 = ligne(parent, D1)
    await d1.waitFor()
    await d1.locator('[data-testid="alerte-allergene"]').filter({ hasText: "ZZ Arachide" }).waitFor()
    verifier((await ligne(parent, D2).count()) === 0, "un menu en brouillon n'est pas proposé")
    verifier((await ligne(parent, AUJ).locator('[data-testid="alerte-allergene"]').count()) === 0, "pas d'alerte sur un menu sans allergène")
    await d1.getByRole("button", { name: "Réserver" }).click()
    await attendre(async () => !!(await db.reservation.findFirst({ where: { inscritId: f1.id, date: dateUtc(D1), service: "LUNCH", statut: "BOOKED" } })), "réservation enregistrée")
    await parent.reload({ waitUntil: "load" })
    await ligne(parent, D1).waitFor()
    verifier((await ligne(parent, D1).getAttribute("data-etat")) === "reserve", "repas affiché comme réservé")
    await ligne(parent, D1).getByRole("button", { name: "Annuler", exact: true }).click()
    await attendre(async () => !!(await db.reservation.findFirst({ where: { inscritId: f1.id, date: dateUtc(D1), service: "LUNCH", statut: "CANCELLED" } })), "réservation annulée")
    verifier(!!(await db.auditLog.findFirst({ where: { action: "RESERVATION_CREATED", details: { contains: "(parent)" } } })), "réservation du parent tracée")
  })

  await etape("Recharge en ligne : montant contrôlé, Paystack simulé, crédit unique après vérification", async () => {
    await ouvrir(parent, "/famille/" + f1.id, "fiche-enfant")
    const f = parent.locator('[data-testid="form-recharge-en-ligne"]')
    await f.locator("#rl-montant").fill("100")
    await f.getByRole("button", { name: "Payer avec Paystack" }).click()
    await f.getByText("Montant invalide").waitFor()
    verifier((await db.paiementEnLigne.count({ where: { inscritId: f1.id } })) === 0, "aucune demande créée pour un montant refusé")
    await f.locator("#rl-montant").fill("2000")
    await f.getByRole("button", { name: "Payer avec Paystack" }).click()
    await cheminAttendu(parent, "/famille/retour", "retour depuis Paystack")
    await parent.locator('[data-testid="retour-paiement"][data-issue="CREDITE"]').waitFor()
    const p = await db.paiementEnLigne.findFirst({ where: { inscritId: f1.id } })
    verifier(p && p.statut === "SUCCESS" && p.montant === 2000 && p.creditedAt, "paiement enregistré et crédité")
    const init = mock.initialises[p.reference]
    verifier(init && init.amount === 200000 && init.currency === "XOF" && init.email === PARENT, "Paystack reçoit 2000 XOF x 100, la devise et l'e-mail du parent")
    verifier((await solde(f1.id)) === 2000, "solde de 2000")
    const t = await db.transaction.findFirst({ where: { inscritId: f1.id, type: "TOPUP" } })
    verifier(t && t.methode === "PAYSTACK" && t.reference === p.reference && t.montant === 2000, "opération de recharge rattachée à Paystack")
    await parent.reload({ waitUntil: "load" })
    await parent.locator('[data-testid="retour-paiement"][data-issue="DEJA"]').waitFor()
    verifier((await solde(f1.id)) === 2000, "un rechargement de la page ne crédite pas deux fois")
  })

  await etape("Webhook : signature obligatoire, crédit unique, montant incohérent et échec jamais crédités", async () => {
    const creer = (reference, montant, inscritId = f2.id) => db.paiementEnLigne.create({ data: { etablissementId: IA.id, inscritId, userId: parentUser.id, userEmail: PARENT, reference, montant } })
    await creer("ZZ-WH-1", 1500)
    mock.verif["ZZ-WH-1"] = { status: "success", amount: 150000 }
    verifier((await webhook("ZZ-WH-1")).status === 401, "sans signature : refusé")
    verifier((await webhook("ZZ-WH-1", "deadbeef")).status === 401, "mauvaise signature : refusé")
    verifier((await solde(f2.id)) === 0, "rien n'est crédité sans signature valide")
    verifier((await webhook("ZZ-WH-1", "ok")).status === 200, "signature valide : accepté")
    await attendre(async () => (await solde(f2.id)) === 1500, "crédit de 1500")
    verifier((await webhook("ZZ-WH-1", "ok")).status === 200, "rejeu accepté")
    await sleep(500)
    verifier((await solde(f2.id)) === 1500 && (await db.transaction.count({ where: { inscritId: f2.id, type: "TOPUP" } })) === 1, "le rejeu ne crédite pas deux fois")

    await creer("ZZ-WH-2", 1000)
    mock.verif["ZZ-WH-2"] = { status: "success", amount: 100 }
    verifier((await webhook("ZZ-WH-2", "ok")).status === 200, "webhook incohérent reçu")
    await attendre(async () => !!(await db.auditLog.findFirst({ where: { action: "PAIEMENT_PAYSTACK_INCOHERENT", details: { contains: "ZZ-WH-2" } } })), "incohérence tracée")
    const p2 = await db.paiementEnLigne.findUnique({ where: { reference: "ZZ-WH-2" } })
    verifier(p2.statut === "PENDING" && (await solde(f2.id)) === 1500, "montant incohérent : aucun crédit")

    await creer("ZZ-WH-3", 1000)
    mock.verif["ZZ-WH-3"] = { status: "failed", amount: 100000 }
    verifier((await webhook("ZZ-WH-3", "ok")).status === 200, "webhook d'échec reçu")
    await attendre(async () => (await db.paiementEnLigne.findUnique({ where: { reference: "ZZ-WH-3" } })).statut === "FAILED", "paiement marqué en échec")
    verifier((await solde(f2.id)) === 1500, "échec : aucun crédit")
    verifier((await webhook("ZZ-INCONNU", "ok")).status === 200, "référence inconnue : réponse propre")
  })

  await etape("Paiement en attente : vérification manuelle par le parent", async () => {
    const creer = (reference, montant) => db.paiementEnLigne.create({ data: { etablissementId: IA.id, inscritId: f1.id, userId: parentUser.id, userEmail: PARENT, reference, montant } })
    await creer("ZZ-PD-1", 1000)
    await creer("ZZ-PD-2", 700)
    mock.verif["ZZ-PD-1"] = { status: "success", amount: 100000 }
    mock.verif["ZZ-PD-2"] = { status: "ongoing", amount: 70000 }
    await ouvrir(parent, "/famille/" + f1.id, "fiche-enfant")
    const l1 = parent.locator('[data-testid="paiements-attente"] li[data-reference="ZZ-PD-1"]')
    await l1.getByRole("button", { name: "Vérifier" }).click()
    await attendre(async () => (await solde(f1.id)) === 3000, "paiement confirmé et crédité")
    const l2 = parent.locator('[data-testid="paiements-attente"] li[data-reference="ZZ-PD-2"]')
    await l2.getByRole("button", { name: "Vérifier" }).click()
    await l2.getByText("attente").waitFor()
    verifier((await solde(f1.id)) === 3000, "paiement non abouti : aucun crédit")
  })

  await etape("Du portail au service : repas réservé par le parent, débité au scan, visible dans son historique", async () => {
    await ouvrir(parent, "/famille/" + f1.id, "fiche-enfant")
    await ligne(parent, AUJ).getByRole("button", { name: "Réserver" }).click()
    await attendre(async () => !!(await db.reservation.findFirst({ where: { inscritId: f1.id, date: dateUtc(AUJ), service: "LUNCH", statut: "BOOKED" } })), "réservation du jour")
    const caisse = await connecter(BASE, CAISSE, mdpCaisse)
    await ouvrir(caisse, "/service?service=LUNCH", "service-page")
    await caisse.locator("#scan-code").fill(badge(1))
    await caisse.getByRole("button", { name: "Valider" }).click()
    await caisse.locator('[data-testid="resultat-scan"][data-statut="SERVI"]').waitFor()
    await attendre(async () => (await solde(f1.id)) === 2500, "repas débité de 500")
    await caisse.context().close()
    await parent.reload({ waitUntil: "load" })
    await parent.locator('[data-testid="fiche-enfant"]').waitFor()
    verifier((await parent.locator('[data-testid="solde-enfant"]').getAttribute("data-solde")) === "2500", "solde mis à jour chez le parent")
    verifier((await parent.locator('[data-testid="historique"] tr[data-type="DEBIT"]').count()) === 1, "débit visible dans l'historique")
    verifier((await ligne(parent, AUJ).getAttribute("data-etat")) === "servi", "repas affiché comme servi")
  })

  await etape("Isolation, secret et cohérence : autre parent étanche, clé Paystack jamais exposée, soldes cohérents, audit complet", async () => {
    const p2 = await connecter(BASE, PARENT2, mdpParent2)
    await ouvrir(p2, "/famille", "liste-enfants")
    verifier((await p2.locator('[data-testid="enfant-card"]').count()) === 1, "le second parent ne voit que son enfant")
    await p2.goto(BASE + "/famille/" + f1.id, { waitUntil: "load" })
    await cheminAttendu(p2, "/famille", "fiche d'un enfant d'une autre famille refusée")
    await p2.context().close()

    await ouvrir(parent, "/famille/" + f1.id, "fiche-enfant")
    verifier(!(await parent.content()).includes(CLE), "la clé secrète n'apparaît jamais dans la page")

    for (const i of await db.inscrit.findMany({ where: { etablissementId: IA.id } })) {
      const agg = await db.transaction.aggregate({ where: { inscritId: i.id }, _sum: { montant: true } })
      verifier(i.solde === (agg._sum.montant ?? 0), "solde cohérent avec l'historique pour " + i.matricule)
    }
    for (const action of ["PAIEMENT_PAYSTACK_INIT", "PAIEMENT_PAYSTACK", "PAIEMENT_PAYSTACK_INCOHERENT"]) verifier(!!(await db.auditLog.findFirst({ where: { action } })), "audit " + action + " attendu")
  })

  await parent.context().close()
}

let code = 0
try {
  await principal()
} catch (e) {
  code = 1
  console.log("  ERREUR : " + (e && e.message ? e.message : e))
}
serveurMock.close()
await terminer(nettoyer, "FAMILLE", code)