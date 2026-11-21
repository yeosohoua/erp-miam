import "dotenv/config"
import { randomBytes } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"

import { PrismaPg } from "@prisma/adapter-pg"
import * as bcryptModule from "bcryptjs"
import Redis from "ioredis"
import { chromium } from "playwright"

import { PrismaClient } from "../src/generated/prisma/client.ts"

const bcrypt = bcryptModule.default ?? bcryptModule
const PORT = 3102
const BASE = "http://localhost:" + PORT
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const redis = new Redis(process.env.REDIS_URL)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const secret = () => randomBytes(8).toString("hex") + "Zz9"
const mdpAdmin = secret()
const mdpResp1 = secret()
const mdpResp2 = secret()
const mdpResp3 = secret()
const ADMIN = { email: "test-et-admin@miam.test", name: "Test Et Admin", role: "ADMIN" }
const RESP_EMAIL = "test-et-resp@miam.test"
const EMAILS = [ADMIN.email, RESP_EMAIL]

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
  await sleep(400)
}

async function connecter(email, mdp) {
  const p = await nouvellePage()
  await ouvrir("/login", p)
  await p.locator('input[name="email"]').fill(email)
  await p.locator('input[name="password"]').fill(mdp)
  await p.locator('button[type="submit"]').first().click()
  await p.waitForURL((u) => u.pathname === "/", { timeout: 30000 })
  await p.locator('[data-testid="menu-principal"]').waitFor()
  return p
}

const cheminAttendu = (p, chemin, message) => attendre(() => new URL(p.url()).pathname === chemin, message)
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
  const admin0 = await db.user.create({ data: { ...ADMIN, passwordHash: bcrypt.hashSync(mdpAdmin, 10), active: true } })

  serveur = spawn("npx", ["next", "start", "-p", String(PORT)], { shell: true, cwd: process.cwd(), env: process.env, stdio: "ignore" })
  await attendre(async () => {
    try {
      return (await fetch(BASE + "/api/sante")).ok
    } catch {
      return false
    }
  }, "demarrage du serveur", 60000)
  navigateur = await chromium.launch()
  const admin = await connecter(ADMIN.email, mdpAdmin)

  await etape("Établissements : code invalide et doublon refusés, école et entreprise créées", async () => {
    await ouvrir("/parametres/etablissements", admin)
    const creer = async (code, nom, type) => {
      await admin.locator("#etab-code").fill(code)
      await admin.locator("#etab-nom").fill(nom)
      await admin.locator("#etab-type").selectOption(type)
      await admin.getByRole("button", { name: "Créer l'établissement" }).click()
    }
    await creer("!", "ZZ Lycée A", "SCHOOL")
    await alerte(admin, "Code invalide")
    await creer("zz-a", "ZZ Lycée A", "SCHOOL")
    await attendre(() => db.etablissement.findUnique({ where: { code: "ZZ-A" } }), "établissement A créé")
    await statut(admin, "Établissement créé")
    await sleep(500)
    await creer("ZZ-A", "ZZ Autre", "SCHOOL")
    await alerte(admin, "déjà utilisé")
    await creer("ZZ-B", "ZZ Entreprise B", "COMPANY")
    const b = await attendre(() => db.etablissement.findUnique({ where: { code: "ZZ-B" } }), "établissement B créé")
    verifier(b.type === "COMPANY" && b.currency === "XOF" && b.active, "valeurs de l'établissement B")
    await admin.locator('[data-etab="ZZ-A"]').waitFor()
    verifier(!!(await db.auditLog.findFirst({ where: { action: "ETABLISSEMENT_CREATED", details: { contains: "ZZ-A" } } })), "audit de création attendu")
  })

  const A = await db.etablissement.findUnique({ where: { code: "ZZ-A" } })
  const B = await db.etablissement.findUnique({ where: { code: "ZZ-B" } })

  await etape("Utilisateur : mot de passe faible et absence d'établissement refusés, responsable créé pour l'école A", async () => {
    await ouvrir("/parametres/utilisateurs", admin)
    const creer = async () => admin.getByRole("button", { name: "Créer l'utilisateur" }).click()
    await admin.locator("#usr-nom").fill("Test Et Resp")
    await admin.locator("#usr-email").fill(RESP_EMAIL)
    await admin.locator("#usr-role").selectOption("MANAGER")
    await admin.locator("#usr-mdp").fill("abc")
    await creer()
    await alerte(admin, "au moins 10 caractères")
    await admin.locator("#usr-mdp").fill(mdpResp1)
    await creer()
    await alerte(admin, "Affectez au moins un établissement")
    await admin.locator("#usr-etab-ZZ-A").check()
    await creer()
    const u = await attendre(() => db.user.findUnique({ where: { email: RESP_EMAIL }, include: { etablissements: true } }), "utilisateur créé")
    verifier(u.role === "MANAGER" && u.etablissements.length === 1 && u.etablissements[0].etablissementId === A.id, "affectation à l'établissement A")
    verifier(u.passwordHash !== mdpResp1, "mot de passe haché")
  })

  let resp
  await etape("Responsable de A : voit seulement son établissement, modifie A, refusé ailleurs", async () => {
    resp = await connecter(RESP_EMAIL, mdpResp1)
    await resp.locator('[data-testid="etab-nom"]').filter({ hasText: "ZZ Lycée A" }).waitFor()
    verifier((await resp.locator("#etab-select").count()) === 0, "pas de sélecteur avec un seul établissement")
    await resp.locator('[data-testid="etab-courant"]').filter({ hasText: "ZZ Lycée A" }).waitFor()
    await resp.goto(BASE + "/parametres/utilisateurs", { waitUntil: "load" })
    await cheminAttendu(resp, "/", "utilisateurs réservés à l'administrateur")
    await resp.goto(BASE + "/parametres/etablissements", { waitUntil: "load" })
    await cheminAttendu(resp, "/parametres", "liste des établissements réservée à l'administrateur")
    await resp.goto(BASE + "/parametres/etablissements/" + B.id, { waitUntil: "load" })
    await cheminAttendu(resp, "/parametres", "établissement B refusé")
    await ouvrir("/parametres/etablissements/" + A.id, resp)
    verifier((await resp.locator("#etab-code").count()) === 0, "le code n'est pas modifiable")
    await resp.locator("#etab-nom").fill("ZZ Lycée A modifié")
    await resp.getByRole("button", { name: "Enregistrer", exact: true }).click()
    await attendre(async () => (await db.etablissement.findUnique({ where: { id: A.id } })).name === "ZZ Lycée A modifié", "nom modifié")
  })

  await etape("Sélecteur : l'administrateur change d'établissement, le choix persiste, un établissement désactivé disparaît", async () => {
    await ouvrir("/", admin)
    const options = await admin.locator("#etab-select option").allTextContents()
    verifier(options.includes("ZZ Lycée A modifié") && options.includes("ZZ Entreprise B"), "les deux établissements sont proposés")
    await admin.locator("#etab-select").selectOption(B.id)
    await attendre(async () => (await admin.context().cookies()).some((c) => c.name === "miam_etab" && c.value === B.id), "cookie de l'établissement")
    await ouvrir("/", admin)
    verifier((await admin.locator("#etab-select").inputValue()) === B.id, "B reste sélectionné après rechargement")
    await admin.locator('[data-testid="etab-courant"]').filter({ hasText: "ZZ Entreprise B" }).waitFor()
    await ouvrir("/parametres/etablissements", admin)
    await admin.locator('[data-etab="ZZ-B"]').getByRole("button", { name: "Désactiver" }).click()
    await attendre(async () => (await db.etablissement.findUnique({ where: { id: B.id } })).active === false, "B désactivé")
    await ouvrir("/", admin)
    const apres = await admin.locator("#etab-select option").allTextContents()
    verifier(!apres.includes("ZZ Entreprise B"), "B n'est plus proposé")
    verifier(!(await admin.locator('[data-testid="etab-courant"]').innerText()).includes("ZZ Entreprise B"), "repli sur un établissement actif")
  })

  await etape("Gestion des comptes : rôle changé coupe la session, verrou sur son propre compte, mot de passe réinitialisé", async () => {
    const u = await db.user.findUnique({ where: { email: RESP_EMAIL } })
    await ouvrir("/parametres/utilisateurs/" + u.id, admin)
    await admin.locator("#usr-role").selectOption("ACCOUNTANT")
    await admin.getByRole("button", { name: "Enregistrer", exact: true }).click()
    await attendre(async () => (await db.user.findUnique({ where: { id: u.id } })).role === "ACCOUNTANT", "rôle modifié")
    await resp.goto(BASE + "/", { waitUntil: "load" })
    await cheminAttendu(resp, "/login", "session du responsable coupée")
    await resp.context().close()

    await ouvrir("/parametres/utilisateurs/" + admin0.id, admin)
    await admin.locator("#usr-role").selectOption("MANAGER")
    await admin.getByRole("button", { name: "Enregistrer", exact: true }).click()
    await alerte(admin, "propre rôle")
    verifier((await db.user.findUnique({ where: { id: admin0.id } })).role === "ADMIN", "le rôle de l'administrateur est inchangé")

    await ouvrir("/parametres/utilisateurs/" + u.id, admin)
    await admin.locator("#reset-mdp").fill(mdpResp2)
    await admin.locator("#reset-confirmation").fill(mdpResp2)
    await admin.getByRole("button", { name: "Réinitialiser le mot de passe" }).click()
    await statut(admin, "Mot de passe réinitialisé")
    const ancien = await nouvellePage()
    await ouvrir("/login", ancien)
    await ancien.locator('input[name="email"]').fill(RESP_EMAIL)
    await ancien.locator('input[name="password"]').fill(mdpResp1)
    await ancien.locator('button[type="submit"]').first().click()
    await alerte(ancien, "Identifiants incorrects")
    await ancien.context().close()
  })

  await etape("Mon compte : profil, mot de passe actuel exigé, autres sessions coupées, session courante conservée", async () => {
    const a = await connecter(RESP_EMAIL, mdpResp2)
    const b = await connecter(RESP_EMAIL, mdpResp2)
    await ouvrir("/compte", a)
    await a.locator("#profil-nom").fill("Test Et Resp Renomme")
    await a.getByRole("button", { name: "Enregistrer le profil" }).click()
    await attendre(async () => (await db.user.findUnique({ where: { email: RESP_EMAIL } })).name === "Test Et Resp Renomme", "nom modifié")
    await a.locator("#mdp-actuel").fill("mauvais-mot-de-passe-1")
    await a.locator("#mdp-nouveau").fill(mdpResp3)
    await a.locator("#mdp-confirmation").fill(mdpResp3)
    await a.getByRole("button", { name: "Changer le mot de passe" }).click()
    await alerte(a, "actuel incorrect")
    await a.locator("#mdp-actuel").fill(mdpResp2)
    await a.locator("#mdp-nouveau").fill("court")
    await a.locator("#mdp-confirmation").fill("court")
    await a.getByRole("button", { name: "Changer le mot de passe" }).click()
    await alerte(a, "au moins 10 caractères")
    await a.locator("#mdp-nouveau").fill(mdpResp3)
    await a.locator("#mdp-confirmation").fill(mdpResp3)
    await a.getByRole("button", { name: "Changer le mot de passe" }).click()
    await statut(a, "Mot de passe modifié")
    await ouvrir("/compte", a)
    verifier(new URL(a.url()).pathname === "/compte", "la session courante est conservée")
    await b.goto(BASE + "/", { waitUntil: "load" })
    await cheminAttendu(b, "/login", "l'autre session est coupée")
    await b.context().close()
    await a.context().close()
    const neuf = await connecter(RESP_EMAIL, mdpResp3)
    await neuf.context().close()
    for (const action of ["ETABLISSEMENT_UPDATED", "ETABLISSEMENT_DEACTIVATED", "USER_CREATED", "USER_UPDATED", "PASSWORD_RESET", "PASSWORD_CHANGED", "PROFILE_UPDATED"]) {
      verifier(!!(await db.auditLog.findFirst({ where: { action } })), "audit " + action + " attendu")
    }
  })

  await admin.context().close()
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
console.log(code === 0 ? "=== TESTS ETABLISSEMENTS OK ===" : "=== TESTS ETABLISSEMENTS ECHEC ===")
process.exit(code)