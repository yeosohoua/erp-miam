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

const PORT = 3132
const BASE = "http://localhost:" + PORT
const mdpGest = secret()
const mdpCais = secret()
const GEST = "test-ti-gest@miam.test"
const CAIS = "test-ti-cais@miam.test"
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
  const E = await db.etablissement.create({ data: { code: "ZZ-TI", name: "ZZ Cantine Tiroir", type: "SCHOOL", prepaye: true } })
  const creerUser = (email, name, role, mdp) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  await creerUser(GEST, "Test Ti Gest", "MANAGER", mdpGest)
  await creerUser(CAIS, "Test Ti Cais", "CASHIER", mdpCais)
  await db.articleCarte.create({ data: { etablissementId: E.id, nom: "ZZ Jus", prix: 500, categorie: "Boissons" } })
  const sCais = await db.sessionCaisse.create({ data: { etablissementId: E.id, numero: 1, caissierEmail: CAIS, fondInitial: 5000 } })
  const sGest = await db.sessionCaisse.create({ data: { etablissementId: E.id, numero: 2, caissierEmail: GEST, fondInitial: 0 } })
  const ins = await db.inscrit.create({ data: { etablissementId: E.id, matricule: "ZZ-TI-1", badge: "ZZ-TI-BADGE", firstName: "Zz", lastName: "Tiroir" } })

  await demarrer(BASE, PORT)
  const cais = await connecter(BASE, CAIS, mdpCais)
  const gest = await connecter(BASE, GEST, mdpGest)
  const aller = async (p, testid) => {
    await p.goto(BASE + "/caisse", { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
  }
  const attendu = async (p) => {
    await aller(p, "session-courante")
    return await p.locator('[data-testid="session-courante"]').getAttribute("data-attendu")
  }

  await etape("Tiroir : fond + vente en espèces + recharge au guichet = espèces attendues", async () => {
    await aller(cais, "caisse-page")
    await cais.locator('[data-article="ZZ Jus"]:visible').click()
    await cais.locator('[data-article="ZZ Jus"]:visible').click()
    await cais.locator('[data-mode="CASH"]:visible').click()
    await cais.locator("#ca-recu").fill("1000")
    await cais.getByRole("button", { name: "Encaisser" }).click()
    await cais.locator('[data-testid="caisse-resultat"][data-numero="1"]').waitFor()
    verifier((await attendu(cais)) === "6000", "5000 de fond + 1000 de vente = 6000")
    await db.transaction.create({ data: { etablissementId: E.id, inscritId: ins.id, type: "TOPUP", methode: "CASH", montant: 2000, reference: "ZZ-TOP-1", createdBy: CAIS } })
    await db.transaction.create({ data: { etablissementId: E.id, inscritId: ins.id, type: "TOPUP", methode: "CASH", montant: 700, reference: "ZZ-TOP-AUTRE", createdBy: GEST } })
    verifier((await attendu(cais)) === "8000", "la recharge de 2000 faite par ce caissier entre dans le tiroir (pas celle d'un autre)")
  })

  await etape("Remboursement partiel : plafonné, sorti du tiroir de celui qui rembourse, vente non annulable ensuite", async () => {
    const v = await db.venteComptoir.findFirst({ where: { etablissementId: E.id, numero: 1 } })
    await aller(gest, "caisse-page")
    const ligne = gest.locator('[data-vente="' + v.id + '"]')
    await ligne.locator('input[name="montant"]').fill("300")
    await ligne.locator('input[name="motif"]').fill("Jus renversé")
    await ligne.getByRole("button", { name: "Rembourser" }).click()
    await attendre(async () => (await db.venteRemboursement.count({ where: { venteId: v.id } })) === 1, "remboursement enregistré")
    const r = await db.venteRemboursement.findFirst({ where: { venteId: v.id } })
    verifier(r.montant === 300 && r.sessionId === sGest.id && r.createdBy === GEST, "remboursement de 300 rattaché à la caisse du gestionnaire")
    verifier((await attendu(gest)) === "400", "tiroir du gestionnaire : recharge de 700 moins remboursement de 300")
    verifier((await attendu(cais)) === "8000", "le tiroir du caissier ne bouge pas")

    const l2 = gest.locator('[data-vente="' + v.id + '"]')
    await l2.locator('input[name="montant"]').fill("800")
    await l2.locator('input[name="motif"]').fill("Trop demandé")
    await l2.getByRole("button", { name: "Rembourser" }).click()
    await l2.locator('[data-testid="msg-erreur"]').filter({ hasText: "Montant invalide" }).waitFor()
    verifier((await db.venteRemboursement.count({ where: { venteId: v.id } })) === 1, "800 dépasse le reste de 700 : refusé")

    await gest.locator('[data-vente="' + v.id + '"]').getByRole("button", { name: "Annuler" }).click()
    await sleep(2000)
    const apres = await db.venteComptoir.findUnique({ where: { id: v.id } })
    verifier(apres.statut === "PAYEE", "une vente remboursée en partie n'est pas annulable")
    const audit = await db.auditLog.count({ where: { userEmail: GEST, action: "VENTE_REMBOURSEE" } })
    verifier(audit === 1, "remboursement audité")
  })

  await etape("Clôture : les espèces attendues incluent la recharge, écart nul", async () => {
    await aller(cais, "caisse-page")
    const form = cais.locator('[data-testid="form-cloture"]:visible').first()
    await form.locator('input[name="compte"]').fill("8000")
    await form.locator('button[type="submit"]').click()
    const s = await attendre(async () => {
      const x = await db.sessionCaisse.findUnique({ where: { id: sCais.id } })
      return x.statut === "CLOTUREE" ? x : null
    }, "caisse clôturée")
    verifier(s.especesAttendues === 8000 && s.especesComptees === 8000 && s.ecart === 0, "attendu 8000, compté 8000, écart 0")
  })
}

principal()
  .then(() => terminer(nettoyer, "TIROIR", 0))
  .catch((e) => {
    console.log("ERREUR : " + e.message)
    return terminer(nettoyer, "TIROIR", 1)
  })