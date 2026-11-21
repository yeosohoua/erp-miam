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
const dateUtc = (iso) => new Date(iso + "T00:00:00.000Z")
const AUJ = new Date().toISOString().slice(0, 10)

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

const PORT = 3109
const BASE = "http://localhost:" + PORT
const mdpCaisse = secret()
const mdpMgr = secret()
const mdpMgrB = secret()
const mdpChef = secret()
const mdpCompta = secret()
const CAISSE = "test-pa-caisse@miam.test"
const MGR = "test-pa-mgr@miam.test"
const MGRB = "test-pa-mgrb@miam.test"
const CHEF = "test-pa-chef@miam.test"
const COMPTA = "test-pa-compta@miam.test"
const EMAILS = [CAISSE, MGR, MGRB, CHEF, COMPTA]

const alerteTexte = (p, statut, texte) => p.locator('[data-testid="resultat-scan"][data-statut="' + statut + '"]').filter({ hasText: texte }).waitFor()
const cheminAttendu = (p, chemin, message) => attendre(() => new URL(p.url()).pathname === chemin, message)

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { OR: [{ userEmail: { in: EMAILS } }, { details: { contains: "ZZ" } }] } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const IA = await db.etablissement.create({ data: { code: "ZZ-PA", name: "ZZ Ecole PA", type: "SCHOOL" } })
  const IB = await db.etablissement.create({ data: { code: "ZZ-PB", name: "ZZ Ecole PB", type: "SCHOOL" } })
  const creerUser = (email, name, role, mdp, etab) =>
    db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: etab.id }] } } })
  await creerUser(CAISSE, "Test Pa Caisse", "CASHIER", mdpCaisse, IA)
  await creerUser(MGR, "Test Pa Mgr", "MANAGER", mdpMgr, IA)
  await creerUser(MGRB, "Test Pa MgrB", "MANAGER", mdpMgrB, IB)
  await creerUser(CHEF, "Test Pa Chef", "CHEF", mdpChef, IA)
  await creerUser(COMPTA, "Test Pa Compta", "ACCOUNTANT", mdpCompta, IA)

  const badge = (n) => "ZZP" + String(n).padStart(13, "0")
  const inscrit = (n, statut) => db.inscrit.create({ data: { etablissementId: IA.id, matricule: "ZZP-" + n, firstName: "Pa", lastName: "Nom" + n, badge: badge(n), statut } })
  const p1 = await inscrit(1, "ACTIVE")
  const p2 = await inscrit(2, "ACTIVE")
  const p3 = await inscrit(3, "LEFT")
  const p4 = await inscrit(4, "ACTIVE")
  await db.menu.create({ data: { etablissementId: IA.id, date: dateUtc(AUJ), service: "LUNCH", statut: "PUBLISHED" } })
  for (const i of [p1, p2, p4]) await db.reservation.create({ data: { etablissementId: IA.id, inscritId: i.id, date: dateUtc(AUJ), service: "LUNCH" } })

  const solde = async (id) => (await db.inscrit.findUnique({ where: { id } })).solde
  const resa = (inscritId) => db.reservation.findFirst({ where: { etablissementId: IA.id, inscritId, date: dateUtc(AUJ), service: "LUNCH" } })
  const ouvrir = async (p, chemin, testid) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]').waitFor()
    await sleep(300)
  }
  const recharger = async (p, matricule, montant, methode, reference = "") => {
    const f = p.locator('[data-testid="form-recharge"]')
    await f.locator("#rc-matricule").fill(matricule)
    await f.locator("#rc-montant").fill(montant)
    await f.locator("#rc-methode").selectOption(methode)
    await f.locator("#rc-reference").fill(reference)
    await f.getByRole("button", { name: "Enregistrer la recharge" }).click()
  }
  const messageRecharge = (p, texte) => p.locator('[data-testid="form-recharge"]').getByText(texte).waitFor()
  const scanner = async (p, code) => {
    await p.locator("#scan-code").fill(code)
    await p.getByRole("button", { name: "Valider" }).click()
  }
  const attr = (p, testid, a) => p.locator('[data-testid="' + testid + '"]').getAttribute(a)

  await demarrer(BASE, PORT)
  const mgr = await connecter(BASE, MGR, mdpMgr)
  const caisse = await connecter(BASE, CAISSE, mdpCaisse)

  await etape("Tarifs : prix invalide refusé, prix du déjeuner et débit automatique enregistrés", async () => {
    await ouvrir(mgr, "/paiements", "paiements-page")
    const f = mgr.locator('[data-testid="form-tarifs"]')
    await f.locator("#prix-LUNCH").fill("abc")
    await f.getByRole("button", { name: "Enregistrer les tarifs" }).click()
    await f.getByText("Prix invalide").waitFor()
    verifier((await db.tarif.count({ where: { etablissementId: IA.id } })) === 0, "aucun tarif écrit après un refus")
    await f.locator("#prix-LUNCH").fill("500")
    await f.locator("#prepaye").check()
    await f.getByRole("button", { name: "Enregistrer les tarifs" }).click()
    await attendre(async () => (await db.etablissement.findUnique({ where: { id: IA.id } })).prepaye === true, "mode prépayé activé")
    const t = await db.tarif.findUnique({ where: { etablissementId_service: { etablissementId: IA.id, service: "LUNCH" } } })
    verifier(t && t.prix === 500, "prix du déjeuner à 500")
  })

  await etape("Recharges : validations, espèces, Mobile Money et référence jamais réutilisée", async () => {
    await ouvrir(caisse, "/paiements", "paiements-page")
    await recharger(caisse, "ZZP-1", "0", "CASH")
    await messageRecharge(caisse, "Montant invalide")
    await recharger(caisse, "ZZP-404", "1000", "CASH")
    await messageRecharge(caisse, "Matricule inconnu")
    await recharger(caisse, "ZZP-2", "1000", "ORANGE")
    await messageRecharge(caisse, "obligatoire")
    await recharger(caisse, "ZZP-3", "1000", "CASH")
    await messageRecharge(caisse, "quitté")
    verifier((await db.transaction.count({ where: { etablissementId: IA.id } })) === 0, "aucune écriture après les refus")

    await recharger(caisse, "ZZP-1", "2000", "CASH")
    await attendre(async () => (await solde(p1.id)) === 2000, "ZZP-1 rechargé de 2000")
    await recharger(caisse, "ZZP-2", "1000", "ORANGE", "OM-ZZ-0001")
    await attendre(async () => (await solde(p2.id)) === 1000, "ZZP-2 rechargé de 1000")
    await recharger(caisse, "ZZP-1", "500", "WAVE", "OM-ZZ-0001")
    await messageRecharge(caisse, "déjà été enregistrée")
    await sleep(500)
    verifier((await solde(p1.id)) === 2000, "la référence réutilisée ne crédite pas le compte")
    const ligne = caisse.locator('tr[data-matricule="ZZP-1"]')
    await attendre(async () => (await ligne.getAttribute("data-solde")) === "2000", "solde affiché dans la liste")
    verifier((await db.transaction.count({ where: { etablissementId: IA.id, type: "TOPUP" } })) === 2, "deux recharges enregistrées")
  })

  await etape("Service : repas débité au scan, remboursé si le pointage est annulé, débité de nouveau au pointage", async () => {
    await ouvrir(caisse, "/service?service=LUNCH", "service-page")
    await scanner(caisse, badge(1))
    await alerteTexte(caisse, "SERVI", "Nom1")
    await caisse.locator('[data-testid="paiement-scan"]').waitFor()
    await attendre(async () => (await solde(p1.id)) === 1500, "ZZP-1 débité de 500")
    const debit = await db.transaction.findFirst({ where: { inscritId: p1.id, type: "DEBIT" } })
    verifier(debit && debit.montant === -500 && debit.reservationId, "débit rattaché à la réservation")
    await scanner(caisse, badge(1))
    await alerteTexte(caisse, "DEJA", "Déjà servi")
    await sleep(500)
    verifier((await solde(p1.id)) === 1500, "un second passage ne débite pas")
    await scanner(caisse, badge(2))
    await alerteTexte(caisse, "SERVI", "Nom2")
    await attendre(async () => (await solde(p2.id)) === 500, "ZZP-2 débité de 500")

    await ouvrir(caisse, "/reservations", "jour")
    const ligne = caisse.locator('[data-service="LUNCH"] tr[data-matricule="ZZP-1"]')
    await ligne.getByRole("button", { name: "Annuler le pointage" }).click()
    await attendre(async () => (await solde(p1.id)) === 2000, "pointage annulé : remboursement de 500")
    verifier((await db.transaction.count({ where: { inscritId: p1.id, type: "REFUND", montant: 500 } })) === 1, "remboursement tracé")
    verifier(!(await resa(p1.id)).servedAt, "repas à nouveau non servi")
    await ligne.getByRole("button", { name: "Pointer" }).click()
    await attendre(async () => (await solde(p1.id)) === 1500, "pointage manuel : débit de 500")
  })

  await etape("Solde insuffisant : service refusé, puis exception explicite au solde négatif", async () => {
    await ouvrir(caisse, "/service?service=LUNCH", "service-page")
    await scanner(caisse, badge(4))
    await alerteTexte(caisse, "SOLDE_INSUFFISANT", "Solde insuffisant")
    verifier(!(await resa(p4.id)).servedAt && (await solde(p4.id)) === 0, "rien n'est servi ni débité")
    await caisse.getByRole("button", { name: "Servir quand même" }).click()
    await alerteTexte(caisse, "SERVI", "Nom4")
    await attendre(async () => (await solde(p4.id)) === -500, "solde négatif après exception")
    verifier(!!(await resa(p4.id)).servedAt, "repas servi")
  })

  await etape("Droits et isolation : chef refusé, comptable en lecture, caissier sans réglages, autre établissement étanche", async () => {
    const chef = await connecter(BASE, CHEF, mdpChef)
    await chef.goto(BASE + "/paiements", { waitUntil: "load" })
    await cheminAttendu(chef, "/", "le chef est renvoyé à l'accueil")
    await chef.context().close()

    const compta = await connecter(BASE, COMPTA, mdpCompta)
    await ouvrir(compta, "/paiements", "paiements-page")
    verifier((await compta.locator('[data-testid="form-recharge"]').count()) === 0 && (await compta.locator('[data-testid="form-tarifs"]').count()) === 0, "comptable en lecture seule")
    verifier((await compta.locator('tr[data-matricule="ZZP-1"]').count()) === 1, "le comptable voit les comptes")
    await compta.context().close()

    await ouvrir(caisse, "/paiements", "paiements-page")
    verifier((await caisse.locator('[data-testid="form-tarifs"]').count()) === 0 && (await caisse.locator('[data-testid="form-recharge"]').count()) === 1, "caissier : recharge oui, tarifs non")

    const b = await connecter(BASE, MGRB, mdpMgrB)
    await ouvrir(b, "/paiements", "paiements-page")
    verifier((await b.locator('tr[data-matricule]').count()) === 0, "l'autre établissement ne voit aucun compte")
    verifier((await attr(b, "kpi-encours", "data-valeur")) === "0", "encours de l'autre établissement à 0")
    await b.goto(BASE + "/paiements/" + p1.id, { waitUntil: "load" })
    await cheminAttendu(b, "/paiements", "fiche d'un autre établissement refusée")
    await b.context().close()
  })

  await etape("Fiche : historique, ajustement tracé avec motif obligatoire", async () => {
    await ouvrir(mgr, "/paiements/" + p2.id, "fiche-paiement")
    verifier((await attr(mgr, "solde-inscrit", "data-solde")) === "500", "solde de la fiche")
    const f = mgr.locator('[data-testid="form-ajustement"]')
    await f.locator("#aj-montant").fill("-200")
    await f.getByRole("button", { name: "Enregistrer l'ajustement" }).click()
    await f.getByText("motif").waitFor()
    verifier((await solde(p2.id)) === 500, "aucun ajustement sans motif")
    await f.locator("#aj-montant").fill("-200")
    await f.locator("#aj-motif").fill("ZZ correction")
    await f.getByRole("button", { name: "Enregistrer l'ajustement" }).click()
    await attendre(async () => (await solde(p2.id)) === 300, "ajustement de -200 appliqué")
    await mgr.locator('[data-testid="historique"] tr[data-type="ADJUST"]').waitFor()
    verifier((await mgr.locator('[data-testid="historique"] tr[data-type="TOPUP"]').count()) === 1, "recharge dans l'historique")

    await ouvrir(caisse, "/paiements/" + p2.id, "fiche-paiement")
    verifier((await caisse.locator('[data-testid="form-ajustement"]').count()) === 0 && (await caisse.locator('[data-testid="form-recharge"]').count()) === 1, "le caissier ne peut pas ajuster")
  })

  await etape("Cohérence des comptes, audit complet et carte de recettes du tableau de bord", async () => {
    const inscrits = await db.inscrit.findMany({ where: { etablissementId: IA.id } })
    for (const i of inscrits) {
      const agg = await db.transaction.aggregate({ where: { inscritId: i.id }, _sum: { montant: true } })
      verifier(i.solde === (agg._sum.montant ?? 0), "solde cohérent avec l'historique pour " + i.matricule)
    }
    for (const action of ["PAIEMENT_TOPUP", "PAIEMENT_ADJUST", "PAIEMENT_TARIFS"]) verifier(!!(await db.auditLog.findFirst({ where: { action } })), "audit " + action + " attendu")

    await mgr.goto(BASE + "/", { waitUntil: "load" })
    await mgr.locator('[data-testid="recettes"]').waitFor()
    verifier((await attr(mgr, "recettes", "data-recharges")) === "3000", "recharges de la période")
    verifier((await attr(mgr, "recettes", "data-consomme")) === "1500", "consommation de la période, remboursement déduit")
    verifier((await attr(mgr, "recettes", "data-encours")) === "1300", "encours des comptes")
  })

  await mgr.context().close()
  await caisse.context().close()
}

let code = 0
try {
  await principal()
} catch (e) {
  code = 1
  console.log("  ERREUR : " + (e && e.message ? e.message : e))
}
await terminer(nettoyer, "PAIEMENTS", code)