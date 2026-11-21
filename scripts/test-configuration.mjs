import "dotenv/config"
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

let serveur = null
let navigateur = null
let sauvegardeConfig = null
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

const PORT = 3114
const BASE = "http://localhost:" + PORT
const mdpAdmin = secret()
const mdpMgr = secret()
const ADMIN = "test-cf-admin@miam.test"
const MGR = "test-cf-mgr@miam.test"
const EMAILS = [ADMIN, MGR]
const CLES_ENV = ["PAYSTACK_SECRET_KEY", "PAYSTACK_XOF_FACTOR", "APP_URL", "CRON_SECRET", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM", "TWILIO_MESSAGING_SERVICE_SID", "WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_TEMPLATE", "WHATSAPP_LANG", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]
const SECRET_SMTP = "ZzPass-Secret-4821"
const CLE_PAYSTACK = "sk_test_ZZcfg1234567890"
const SECRET_CRON = "cron-config-secret-0123456"

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: { in: EMAILS } } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
  // La configuration reelle de l'installation est remise telle qu'elle etait avant l'essai.
  if (sauvegardeConfig) {
    await db.configuration.deleteMany()
    if (sauvegardeConfig.length > 0) await db.configuration.createMany({ data: sauvegardeConfig })
  }
}

async function principal() {
  console.log("Preparation...")
  sauvegardeConfig = await db.configuration.findMany()
  await nettoyer()
  await db.configuration.deleteMany()
  // Variables vides : le serveur d'essai ne tient compte ni de l'environnement ni du fichier .env.
  for (const k of CLES_ENV) process.env[k] = ""
  process.env.NOTIF_MOCK_URL = ""

  const E = await db.etablissement.create({ data: { code: "ZZ-CF", name: "ZZ Cantine CF", type: "SCHOOL" } })
  const creerUser = (email, name, role, mdp) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  await creerUser(ADMIN, "Test Cf Admin", "ADMIN", mdpAdmin)
  await creerUser(MGR, "Test Cf Mgr", "MANAGER", mdpMgr)

  const ouvrir = async (p, chemin, testid) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
    await sleep(300)
  }
  const webhook = (cle, corps, signer) =>
    fetch(BASE + "/api/paystack/webhook", { method: "POST", headers: { "x-paystack-signature": signer ?? createHmac("sha512", cle).update(corps).digest("hex") }, body: corps })
  const cron = (s) => fetch(BASE + "/api/notifications/traiter", { method: "POST", headers: s ? { "x-cron-secret": s } : {} })

  await demarrer(BASE, PORT)
  const adm = await connecter(BASE, ADMIN, mdpAdmin)
  const enregistrer = async (groupe, valeurs, mdp, effacer = []) => {
    const f = adm.locator('[data-testid="form-' + groupe + '"]:visible')
    for (const [k, v] of Object.entries(valeurs)) await f.locator("#cf-" + k).fill(v)
    for (const k of effacer) await f.locator("#ef-" + k).check()
    await f.locator("#mdp-" + groupe).fill(mdp)
    await f.getByRole("button", { name: "Enregistrer" }).click()
    return f
  }

  await etape("Accès : réservé à l'administrateur, cinq groupes affichés, rien d'enregistré", async () => {
    const mgr = await connecter(BASE, MGR, mdpMgr)
    await mgr.goto(BASE + "/parametres/configuration", { waitUntil: "load" })
    await attendre(() => new URL(mgr.url()).pathname === "/", "le responsable est renvoyé à l'accueil")
    await ouvrir(adm, "/parametres/configuration", "configuration-page")
    verifier((await adm.locator('[data-testid="groupe"]:visible').count()) === 5, "cinq groupes de réglages")
    verifier((await adm.locator('div[data-cle][data-source="AUCUNE"]:visible').count()) === 17, "dix-sept réglages non définis au départ")
    await ouvrir(adm, "/parametres", "cartes-parametres")
    verifier((await adm.locator('a[href="/parametres/configuration"]:visible').count()) === 1, "carte Configuration visible pour l'administrateur")
    await ouvrir(mgr, "/parametres", "cartes-parametres")
    verifier((await mgr.locator('a[href="/parametres/configuration"]').count()) === 0, "carte Configuration cachée au responsable")
  })

  await etape("Validations : formats refusés, mot de passe exigé, rien d'enregistré", async () => {
    await ouvrir(adm, "/parametres/configuration", "configuration-page")
    let f = await enregistrer("PAYSTACK", { PAYSTACK_SECRET_KEY: "abc" }, mdpAdmin)
    await f.getByText("format attendu").waitFor()
    f = await enregistrer("APPLICATION", { APP_URL: "ftp://exemple.ci/chemin" }, mdpAdmin)
    await f.getByText("adresse attendue").waitFor()
    f = await enregistrer("APPLICATION", { CRON_SECRET: "court" }, mdpAdmin)
    await f.getByText("16 caractères minimum").waitFor()
    f = await enregistrer("EMAIL", { SMTP_PORT: "99999" }, mdpAdmin)
    await f.getByText("entier de 1 à 65535").waitFor()
    f = await enregistrer("EMAIL", { SMTP_HOST: "smtp.zz-cfg.test" }, "mauvais-mot-de-passe")
    await sleep(1500)
    verifier((await db.configuration.count()) === 0, "aucune ligne enregistrée avec une erreur ou un mauvais mot de passe")
  })

  await etape("Chiffrement : valeurs illisibles en base, secret jamais renvoyé au navigateur", async () => {
    await ouvrir(adm, "/parametres/configuration", "configuration-page")
    const f = await enregistrer("EMAIL", { SMTP_HOST: "smtp.zz-cfg.test", SMTP_PORT: "2525", SMTP_USER: "zzuser", SMTP_PASS: SECRET_SMTP, SMTP_FROM: "Cantine ZZ <noreply@zz-cfg.test>" }, mdpAdmin)
    await f.getByText("Configuration enregistrée").waitFor()
    const lignes = await db.configuration.findMany()
    verifier(lignes.length === 5, "cinq réglages enregistrés")
    const brut = JSON.stringify(lignes)
    verifier(!brut.includes(SECRET_SMTP) && !brut.includes("smtp.zz-cfg.test") && !brut.includes("zzuser"), "aucune valeur en clair dans la base")
    await ouvrir(adm, "/parametres/configuration", "configuration-page")
    const html = await adm.content()
    verifier(!html.includes(SECRET_SMTP), "le secret n'apparaît pas dans la page")
    verifier((await adm.locator("#cf-SMTP_PASS:visible").inputValue()) === "", "champ secret toujours vide")
    verifier((await adm.locator('div[data-cle="SMTP_PASS"]:visible').getAttribute("data-source")) === "BASE", "secret signalé comme enregistré")
    verifier((await adm.locator("#cf-SMTP_HOST:visible").inputValue()) === "smtp.zz-cfg.test", "valeur non secrète réaffichée")
  })

  await etape("Effet immédiat : le canal e-mail devient utilisable, sans redémarrage", async () => {
    await ouvrir(adm, "/parametres/notifications", "notifications-page")
    verifier((await adm.locator('[data-testid="canaux"] tr[data-canal="EMAIL"]').getAttribute("data-configure")) === "1", "e-mail configuré")
    verifier((await adm.locator('[data-testid="canaux"] tr[data-canal="SMS"]').getAttribute("data-configure")) === "0", "SMS non configuré")
  })

  await etape("Paystack : clé enregistrée active la signature du webhook, effacée la désactive", async () => {
    const corps = JSON.stringify({ event: "ping" })
    verifier((await webhook(CLE_PAYSTACK, corps)).status === 401, "sans clé : webhook refusé")
    await ouvrir(adm, "/parametres/configuration", "configuration-page")
    let f = await enregistrer("PAYSTACK", { PAYSTACK_SECRET_KEY: CLE_PAYSTACK }, mdpAdmin)
    await f.getByText("Configuration enregistrée").waitFor()
    verifier((await webhook(CLE_PAYSTACK, corps)).status === 200, "signature valide acceptée")
    verifier((await webhook(CLE_PAYSTACK, corps, "0".repeat(128))).status === 401, "signature fausse refusée")
    await ouvrir(adm, "/parametres/configuration", "configuration-page")
    f = await enregistrer("PAYSTACK", {}, mdpAdmin, ["PAYSTACK_SECRET_KEY"])
    await f.getByText("Configuration enregistrée").waitFor()
    verifier((await db.configuration.count({ where: { cle: "PAYSTACK_SECRET_KEY" } })) === 0, "ligne supprimée")
    verifier((await webhook(CLE_PAYSTACK, corps)).status === 401, "après effacement : webhook refusé")
  })

  await etape("Application : secret de l'appel planifié et adresse publique", async () => {
    verifier((await cron(SECRET_CRON)).status === 404, "appel planifié désactivé sans secret")
    await ouvrir(adm, "/parametres/configuration", "configuration-page")
    const f = await enregistrer("APPLICATION", { APP_URL: "https://cantine.zz-cfg.test/", CRON_SECRET: SECRET_CRON }, mdpAdmin)
    await f.getByText("Configuration enregistrée").waitFor()
    verifier((await cron(null)).status === 401, "sans secret : refusé")
    verifier((await cron("mauvais-secret-0123456789")).status === 401, "mauvais secret refusé")
    const ok = await cron(SECRET_CRON)
    verifier(ok.status === 200 && typeof (await ok.json()).traites === "number", "bon secret accepté")
    await ouvrir(adm, "/parametres/configuration", "configuration-page")
    const url = await adm.locator('[data-testid="url-webhook"]:visible').innerText()
    verifier(url.includes("https://cantine.zz-cfg.test/api/paystack/webhook"), "adresse du webhook calculée sans barre finale : " + url)
  })

  await etape("Audit : modifications tracées sans aucune valeur", async () => {
    const lignes = await db.auditLog.findMany({ where: { action: "CONFIG_MODIFIEE", userEmail: ADMIN } })
    verifier(lignes.length >= 4, "au moins quatre modifications tracées")
    const brut = JSON.stringify(lignes)
    for (const v of [SECRET_SMTP, CLE_PAYSTACK, SECRET_CRON, "smtp.zz-cfg.test"]) verifier(!brut.includes(v), "valeur sensible dans l'audit : " + v)
    verifier(lignes.some((l) => (l.details ?? "").includes("SMTP_PASS (modifié)")), "nom du réglage tracé")
  })

  await terminer(nettoyer, "CONFIGURATION", 0)
}

principal().catch(async (e) => {
  console.error("Echec : " + (e && e.message ? e.message : e))
  await terminer(nettoyer, "CONFIGURATION", 1)
})