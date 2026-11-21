import "dotenv/config"
import { randomBytes } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"

import { PrismaPg } from "@prisma/adapter-pg"
import * as bcryptModule from "bcryptjs"
import Redis from "ioredis"
import { chromium } from "playwright"

import { PrismaClient } from "../src/generated/prisma/client.ts"

const bcrypt = bcryptModule.default ?? bcryptModule
const PORT = 3101
const BASE = "http://localhost:" + PORT
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const redis = new Redis(process.env.REDIS_URL)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const motDePasse = randomBytes(12).toString("hex") + "Aa1"
const COMPTES = {
  admin: { email: "test-au-admin@miam.test", name: "Test Admin", role: "ADMIN" },
  caissier: { email: "test-au-caissier@miam.test", name: "Test Caissier", role: "CASHIER" },
  parent: { email: "test-au-parent@miam.test", name: "Test Parent", role: "PARENT" },
  bloque: { email: "test-au-bloque@miam.test", name: "Test Bloque", role: "MANAGER" },
  desactive: { email: "test-au-desactive@miam.test", name: "Test Desactive", role: "MANAGER" },
}
const EMAILS = Object.values(COMPTES).map((c) => c.email)
const MENUS = {
  admin: ["/", "/pilotage", "/analytics", "/inscrits", "/menus", "/reservations", "/production", "/nutrition", "/haccp", "/service", "/satisfaction", "/caisse", "/paiements", "/facturation", "/aides", "/comptabilite", "/stock", "/achats", "/reappro", "/transferts", "/rh", "/personnel", "/parametres"],
  caissier: ["/", "/inscrits", "/reservations", "/service", "/satisfaction", "/caisse", "/paiements"],
  parent: ["/", "/famille"],
}

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

async function saisir(p, email, mdp) {
  await p.locator('input[name="email"]').fill(email)
  await p.locator('input[name="password"]').fill(mdp)
  await p.locator('button[type="submit"]').first().click()
}

async function connecter(compte) {
  const p = await nouvellePage()
  await ouvrir("/login", p)
  await saisir(p, compte.email, motDePasse)
  await p.waitForURL((u) => u.pathname === "/", { timeout: 30000 })
  await p.locator('[data-testid="menu-principal"]').waitFor()
  return p
}

const liensMenu = async (p) =>
  (await p.locator('[data-testid="menu-principal"] a').evaluateAll((els) => els.map((e) => e.getAttribute("href")))).sort()

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: { in: EMAILS } } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const hash = bcrypt.hashSync(motDePasse, 10)
  for (const c of Object.values(COMPTES)) await db.user.create({ data: { ...c, passwordHash: hash, active: true } })

  serveur = spawn("npx", ["next", "start", "-p", String(PORT)], { shell: true, cwd: process.cwd(), env: process.env, stdio: "ignore" })
  await attendre(async () => {
    try {
      return (await fetch(BASE + "/api/sante")).ok
    } catch {
      return false
    }
  }, "demarrage du serveur", 60000)
  navigateur = await chromium.launch()

  await etape("Connexion : accès protégé, identifiants faux refusés, blocage à la 6e tentative stocké dans Redis", async () => {
    const anonyme = await nouvellePage()
    await anonyme.goto(BASE + "/inscrits", { waitUntil: "load" })
    await attendre(() => new URL(anonyme.url()).pathname === "/login", "redirection vers la connexion")
    const email = COMPTES.bloque.email
    for (let n = 1; n <= 5; n++) {
      await saisir(anonyme, email, "mauvais-" + n)
      await attendre(async () => (await db.auditLog.count({ where: { userEmail: email, action: "LOGIN_FAILED" } })) === n, "échec " + n)
      await attendre(() => anonyme.locator('button[type="submit"]').first().isEnabled(), "bouton de connexion actif")
      await new Promise((r) => setTimeout(r, 800))
    }
    await anonyme.locator('p[role="alert"]').filter({ hasText: "Identifiants incorrects" }).waitFor()
    await saisir(anonyme, email, "mauvais-6")
    await anonyme.locator('p[role="alert"]').filter({ hasText: "Trop de tentatives" }).waitFor()
    await saisir(anonyme, email, motDePasse)
    await attendre(async () => (await db.auditLog.count({ where: { userEmail: email, action: "LOGIN_BLOCKED" } })) >= 2, "blocage du bon mot de passe")
    verifier((await redis.ttl("rl:blk:" + email)) > 0, "clé de blocage Redis attendue")
    verifier(new URL(anonyme.url()).pathname === "/login", "toujours sur la page de connexion")
    await anonyme.context().close()
  })

  let admin
  await etape("Administrateur : tableau de bord, menu complet et cartes de modules", async () => {
    admin = await connecter(COMPTES.admin)
    verifier(JSON.stringify(await liensMenu(admin)) === JSON.stringify([...MENUS.admin].sort()), "menu administrateur inattendu")
    await admin.locator('[data-testid="modules"]').waitFor()
    verifier((await admin.locator('[data-testid="modules"] a').count()) === MENUS.admin.length - 1, "cartes de modules")
    await admin.locator("h2", { hasText: "Bonjour Test Admin" }).waitFor()
    await ouvrir("/parametres", admin)
    await admin.locator('[data-testid="cartes-parametres"]').waitFor()
  })

  await etape("Rôles : le caissier voit ses modules seulement, le parent uniquement l'accueil, routes cachées refusées", async () => {
    const caissier = await connecter(COMPTES.caissier)
    verifier(JSON.stringify(await liensMenu(caissier)) === JSON.stringify([...MENUS.caissier].sort()), "menu caissier inattendu")
    await ouvrir("/paiements", caissier)
    await caissier.locator('[data-testid="paiements-page"]').or(caissier.getByText("Aucun établissement ne vous est affecté.")).waitFor()
    await ouvrir("/rh", admin)
    await admin.locator('[data-testid="rh-page"]').or(admin.getByText("Aucun établissement actif.")).waitFor()
    for (const interdit of ["/rh", "/comptabilite", "/parametres", "/stock"]) {
      await caissier.goto(BASE + interdit, { waitUntil: "load" })
      await attendre(() => new URL(caissier.url()).pathname === "/", "renvoi à l'accueil depuis " + interdit)
    }
    await caissier.context().close()
    const parent = await connecter(COMPTES.parent)
    verifier(JSON.stringify(await liensMenu(parent)) === JSON.stringify(MENUS.parent), "menu parent inattendu")
    await parent.locator('[data-testid="modules"]').waitFor()
    await parent.context().close()
  })

  await etape("Déconnexion : session fermée, page protégée refusée, évènement tracé", async () => {
    await admin.getByRole("button", { name: "Se déconnecter" }).click()
    await attendre(() => new URL(admin.url()).pathname === "/login", "retour à la connexion")
    await admin.goto(BASE + "/inscrits", { waitUntil: "load" })
    await attendre(() => new URL(admin.url()).pathname === "/login", "page protégée refusée après déconnexion")
    verifier(!!(await db.auditLog.findFirst({ where: { userEmail: COMPTES.admin.email, action: "LOGOUT" } })), "audit LOGOUT attendu")
    verifier(!!(await db.auditLog.findFirst({ where: { userEmail: COMPTES.admin.email, action: "LOGIN_OK" } })), "audit LOGIN_OK attendu")
    await admin.context().close()
  })

  await etape("Compte désactivé : la session ouverte est coupée immédiatement", async () => {
    const p = await connecter(COMPTES.desactive)
    await db.user.update({ where: { email: COMPTES.desactive.email }, data: { active: false } })
    await p.goto(BASE + "/", { waitUntil: "load" })
    await attendre(() => new URL(p.url()).pathname === "/login", "session coupée après désactivation")
    await p.context().close()
  })
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
console.log(code === 0 ? "=== TESTS AUTH OK ===" : "=== TESTS AUTH ECHEC ===")
process.exit(code)