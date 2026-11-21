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

const PORT = 3133
const BASE = "http://localhost:" + PORT
const mdpGest = secret()
const mdpCais = secret()
const mdpCompta = secret()
const GEST = "test-mx-gest@miam.test"
const CAIS = "test-mx-cais@miam.test"
const COMPTA = "test-mx-compta@miam.test"
const EMAILS = [GEST, CAIS, COMPTA]
const BADGE = "ZZ-MX-BADGE"

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: { in: EMAILS } } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-MX", name: "ZZ Cantine Mixte", type: "SCHOOL", prepaye: true } })
  const creerUser = (email, name, role, mdp) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  await creerUser(GEST, "Test Mx Gest", "MANAGER", mdpGest)
  await creerUser(CAIS, "Test Mx Cais", "CASHIER", mdpCais)
  await creerUser(COMPTA, "Test Mx Compta", "ACCOUNTANT", mdpCompta)
  await db.articleCarte.create({ data: { etablissementId: E.id, nom: "ZZ Jus", prix: 500, categorie: "Boissons" } })
  await db.sessionCaisse.create({ data: { etablissementId: E.id, numero: 1, caissierEmail: CAIS, fondInitial: 1000 } })
  const ins = await db.inscrit.create({ data: { etablissementId: E.id, matricule: "ZZ-MX-1", badge: BADGE, firstName: "Zz", lastName: "Mixte", solde: 300 } })

  await demarrer(BASE, PORT)
  const cais = await connecter(BASE, CAIS, mdpCais)
  const gest = await connecter(BASE, GEST, mdpGest)
  const compta = await connecter(BASE, COMPTA, mdpCompta)
  const aller = async (p, testid) => {
    await p.goto(BASE + "/caisse", { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
  }
  const attendu = async (p) => {
    await aller(p, "session-courante")
    return await p.locator('[data-testid="session-courante"]').getAttribute("data-attendu")
  }
  const solde = async () => (await db.inscrit.findUnique({ where: { id: ins.id } })).solde
  const net706 = async () => {
    const s = await db.ecritureLigne.aggregate({ where: { compte: "706", ecriture: { etablissementId: E.id } }, _sum: { credit: true, debit: true } })
    return (s._sum.credit ?? 0) - (s._sum.debit ?? 0)
  }
  const desequilibres = () =>
    db.$queryRaw`SELECT e.id FROM ecritures_compta e JOIN ecriture_lignes l ON l."ecritureId" = e.id WHERE e."etablissementId" = ${E.id} GROUP BY e.id HAVING SUM(l.debit) <> SUM(l.credit)`
  const comptabiliser = async () => {
    await compta.goto(BASE + "/comptabilite?vue=journal&periode=tout", { waitUntil: "load" })
    await compta.waitForLoadState("networkidle").catch(() => {})
    await compta.locator('[data-testid="compta-page"]:visible').waitFor()
    await compta.getByRole("button", { name: "Comptabiliser maintenant" }).click()
  }

  await etape("Paiement mixte : 300 sur compte + 700 en espèces, compte débité, tiroir = fond + 700", async () => {
    await aller(cais, "caisse-page")
    await cais.locator('[data-article="ZZ Jus"]:visible').click()
    await cais.locator('[data-article="ZZ Jus"]:visible').click()
    await cais.locator('[data-mode="CASH"]:visible').click()
    await cais.locator("#ca-part").fill("300")
    await cais.locator("#ca-identifiant-mixte").fill(BADGE)
    await cais.locator('[data-testid="reste-apercu"][data-valeur="700"]').waitFor()
    await cais.locator("#ca-recu").fill("700")
    await cais.getByRole("button", { name: "Encaisser" }).click()
    await cais.locator('[data-testid="caisse-resultat"][data-numero="1"]').waitFor()
    const v = await db.venteComptoir.findFirst({ where: { etablissementId: E.id, numero: 1 } })
    verifier(v.total === 1000 && v.methode === "CASH" && v.partCompte === 300 && v.recu === 700 && v.inscritId === ins.id, "vente de 1000 : 300 sur compte, 700 en espèces")
    verifier((await solde()) === 0, "le compte est débité de 300")
    const d = await db.transaction.findFirst({ where: { inscritId: ins.id, type: "DEBIT" } })
    verifier(d && d.montant === -300, "mouvement de compte de -300")
    verifier((await attendu(cais)) === "1700", "tiroir : 1000 de fond + 700 d'espèces")
  })

  await etape("Refus : solde insuffisant, part supérieure ou égale au total", async () => {
    await aller(cais, "caisse-page")
    await cais.locator('[data-article="ZZ Jus"]:visible').click()
    await cais.locator('[data-mode="CASH"]:visible').click()
    await cais.locator("#ca-part").fill("400")
    await cais.locator("#ca-identifiant-mixte").fill(BADGE)
    await cais.getByRole("button", { name: "Encaisser" }).click()
    await cais.locator('[data-testid="caisse-erreur"]:visible').filter({ hasText: "Solde insuffisant" }).waitFor()
    await cais.locator("#ca-part").fill("500")
    await cais.getByRole("button", { name: "Encaisser" }).click()
    await cais.locator('[data-testid="caisse-erreur"]:visible').filter({ hasText: "inférieure au total" }).waitFor()
    verifier((await db.venteComptoir.count({ where: { etablissementId: E.id } })) === 1 && (await solde()) === 0, "aucune vente créée, solde inchangé")
  })

  await etape("Comptabilité : espèces 700 + repas servis 300 = produit 1000, toutes les écritures équilibrées", async () => {
    const v = await db.venteComptoir.findFirst({ where: { etablissementId: E.id, numero: 1 } })
    await comptabiliser()
    await attendre(async () => (await net706()) === 1000, "produit de 1000 comptabilisé")
    const e = await db.ecritureCompta.findFirst({ where: { etablissementId: E.id, sourceType: "VENTE", sourceId: v.id }, include: { lignes: true } })
    verifier(e && e.lignes.some((l) => l.compte === "571" && l.debit === 700) && e.lignes.some((l) => l.compte === "706" && l.credit === 700), "écriture de vente : 571 débit 700 / 706 crédit 700")
    verifier((await desequilibres()).length === 0, "aucune écriture déséquilibrée")
  })

  await etape("Remboursement partiel refusé sur paiement mixte, annulation : compte recrédité, écritures contrepassées", async () => {
    const v = await db.venteComptoir.findFirst({ where: { etablissementId: E.id, numero: 1 } })
    await aller(gest, "caisse-page")
    const ligne = gest.locator('[data-vente="' + v.id + '"]')
    await ligne.locator('input[name="montant"]').fill("100")
    await ligne.locator('input[name="motif"]').fill("Essai")
    await ligne.getByRole("button", { name: "Rembourser" }).click()
    await ligne.locator('[data-testid="msg-erreur"]').filter({ hasText: "Paiement mixte" }).waitFor()
    await gest.locator('[data-vente="' + v.id + '"]').getByRole("button", { name: "Annuler" }).click()
    await attendre(async () => (await db.venteComptoir.findUnique({ where: { id: v.id } })).statut === "ANNULEE", "vente annulée")
    verifier((await solde()) === 300, "la part sur compte est recréditée")
    const r = await db.transaction.findFirst({ where: { inscritId: ins.id, type: "REFUND" } })
    verifier(r && r.montant === 300 && r.reference === "CAISSE-1-ANNUL", "mouvement de remboursement de 300")
    verifier((await attendu(cais)) === "1000", "le tiroir retombe au fond de caisse")
    await comptabiliser()
    await attendre(async () => (await net706()) === 0, "produit contrepassé")
    verifier((await db.ecritureCompta.count({ where: { etablissementId: E.id, sourceType: "VENTE_ANNUL" } })) === 1, "écriture d'annulation")
    verifier((await desequilibres()).length === 0, "toutes les écritures restent équilibrées")
  })
}

principal()
  .then(() => terminer(nettoyer, "CAISSE MIXTE", 0))
  .catch((e) => {
    console.log("ERREUR : " + e.message)
    return terminer(nettoyer, "CAISSE MIXTE", 1)
  })