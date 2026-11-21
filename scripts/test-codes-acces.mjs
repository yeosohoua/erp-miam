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
let journal = ""
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

const PORT = 3141
const BASE = "http://localhost:" + PORT
const ETAB = "ZZ-COD"
const ADMIN = "test-codes-admin@miam.test"
const PARENT = "parent-codes@miam.test"
const mdp = secret()
const REGEX_CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{5}$/

async function nettoyer() {
  const e = await db.etablissement.findUnique({ where: { code: ETAB }, select: { id: true } })
  let mails = []
  if (e) {
    const ins = await db.inscrit.findMany({ where: { etablissementId: e.id }, select: { id: true } })
    const emp = await db.employeRh.findMany({ where: { etablissementId: e.id }, select: { id: true } })
    mails = [...ins.map((i) => "inscrit-" + i.id.toLowerCase() + "@acces.miam.local"), ...emp.map((x) => "employe-" + x.id.toLowerCase() + "@acces.miam.local")]
  }
  const tous = [...mails, ADMIN, PARENT]
  await db.auditLog.deleteMany({ where: { userEmail: { in: tous } } })
  await db.user.deleteMany({ where: { email: { in: tous } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  await redis.del("rl:fail:" + ADMIN, "rl:blk:" + ADMIN, "rl:fail:code-ip:inconnue", "rl:blk:code-ip:inconnue", "rl:fail:code-etab:zz-cod", "rl:blk:code-etab:zz-cod")
}

// Une tentative de connexion par code dans un contexte neuf : renvoie l'URL finale, le message d'erreur et la page.
async function tenterCode(etab, code, garder = false) {
  const ctx = await navigateur.newContext({ locale: "fr-FR", viewport: { width: 1280, height: 1800 } })
  const p = await ctx.newPage()
  p.setDefaultTimeout(20000)
  await p.goto(BASE + "/login", { waitUntil: "load" })
  await p.waitForLoadState("networkidle").catch(() => {})
  await p.locator('[data-testid="login-code"] summary').click()
  await p.locator("#code-etab").fill(etab)
  await p.locator("#code-saisie").fill(code)
  await p.locator('[data-testid="login-code-submit"]').click()
  await Promise.race([p.waitForURL((u) => u.pathname !== "/login", { timeout: 15000 }), p.locator('[data-testid="login-code-erreur"]').waitFor({ timeout: 15000 })]).catch(() => {})
  await p.waitForLoadState("networkidle").catch(() => {})
  const erreur = (await p.locator('[data-testid="login-code-erreur"]').count()) > 0 ? await p.locator('[data-testid="login-code-erreur"]').innerText() : ""
  const resultat = { chemin: new URL(p.url()).pathname, erreur, page: p, ctx }
  if (!garder) await ctx.close()
  return resultat
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: ETAB, name: "ZZ Cantine Codes", type: "SCHOOL", prepaye: true } })
  await db.user.create({ data: { email: ADMIN, name: "Test Codes Admin", role: "ADMIN", passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  const badge = () => randomBytes(8).toString("hex").toUpperCase()
  const awa = await db.inscrit.create({ data: { etablissementId: E.id, matricule: "ZC001", firstName: "Awa", lastName: "ZZTest", badge: badge() } })
  await db.inscrit.create({ data: { etablissementId: E.id, matricule: "ZC002", firstName: "Yao", lastName: "ZZTest", badge: badge() } })
  await db.tuteur.create({ data: { inscritId: awa.id, name: "Parent Test", email: PARENT } })
  await db.employeRh.create({ data: { etablissementId: E.id, matricule: "ZE001", firstName: "Koffi", lastName: "ZZEmp", poste: "ZZ Cuisinier", dateEmbauche: new Date("2024-01-15"), salaireBase: 100000 } })

  journal = ""
  serveur = spawn("npx", ["next", "start", "-p", String(PORT)], { shell: true, cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] })
  for (const flux of [serveur.stdout, serveur.stderr]) flux.on("data", (d) => { journal = (journal + d).slice(-8000) })
  await attendre(async () => {
    try {
      return (await fetch(BASE + "/api/sante")).ok
    } catch {
      return false
    }
  }, "demarrage du serveur", 60000)
  navigateur = await chromium.launch()

  const ctxAdmin = await navigateur.newContext({ locale: "fr-FR", viewport: { width: 1440, height: 2400 } })
  const admin = await ctxAdmin.newPage()
  admin.setDefaultTimeout(30000)
  await admin.goto(BASE + "/login", { waitUntil: "load" })
  await admin.waitForLoadState("networkidle").catch(() => {})
  await admin.locator('input[name="email"]').fill(ADMIN)
  await admin.locator('input[name="password"]').fill(mdp)
  await admin.locator('button[type="submit"]').first().click()
  await admin.waitForURL((u) => u.pathname === "/", { timeout: 30000 })
  await ctxAdmin.addCookies([{ name: "miam_etab", value: E.id, url: BASE }])
  const ligne = (cible, nom) => admin.locator('[data-testid="code-ligne"][data-cible="' + cible + '"][data-nom="' + nom + '"]')
  const codeDe = async (cible, nom) => (await ligne(cible, nom).locator('[data-testid="code-valeur"]').innerText()).trim()
  const codes = {}

  await etape("Génération : un code de 5 caractères, unique, pour chaque inscrit, employé et parent", async () => {
    await admin.goto(BASE + "/inscrits/codes", { waitUntil: "load" })
    await admin.waitForLoadState("networkidle").catch(() => {})
    await admin.locator('[data-testid="codes-generer"]').click()
    try {
      await attendre(async () => (await admin.locator('[data-testid="code-valeur"]').count()) === 4, "4 codes affichés")
    } catch (e) {
      console.log("--- page /inscrits/codes ---\n" + (await admin.locator("body").innerText()).slice(0, 1800))
      throw e
    }
    codes.awa = await codeDe("INSCRIT", "Awa ZZTest")
    codes.yao = await codeDe("INSCRIT", "Yao ZZTest")
    codes.emp = await codeDe("EMPLOYE", "Koffi ZZEmp")
    codes.parent = await codeDe("PARENT", PARENT)
    for (const [k, v] of Object.entries(codes)) verifier(REGEX_CODE.test(v), "format du code " + k + " : " + v)
    verifier(new Set(Object.values(codes)).size === 4, "les codes sont tous différents")
  })

  await etape("Connexion d'un élève avec son code : Mon espace, rien d'autre", async () => {
    const r = await tenterCode(ETAB, codes.awa, true)
    verifier(r.chemin === "/mon-espace", "arrivée sur Mon espace (obtenu " + r.chemin + " " + r.erreur + ")")
    const texte = await r.page.locator('[data-testid="mon-espace"]').innerText()
    verifier(texte.includes("Awa ZZTest") && texte.includes("ZC001") && texte.includes(codes.awa), "nom, matricule et code affichés")
    for (const chemin of ["/inscrits", "/caisse", "/parametres"]) {
      await r.page.goto(BASE + chemin, { waitUntil: "load" })
      verifier(new URL(r.page.url()).pathname === "/mon-espace", chemin + " renvoie vers Mon espace")
    }
    await r.page.goto(BASE + "/login", { waitUntil: "load" })
    verifier(new URL(r.page.url()).pathname === "/mon-espace", "déjà connecté : retour sur Mon espace")
    await r.ctx.close()
  })

  await etape("Connexion d'un employé avec son code", async () => {
    const r = await tenterCode(ETAB, codes.emp, true)
    verifier(r.chemin === "/mon-espace", "arrivée sur Mon espace (obtenu " + r.chemin + " " + r.erreur + ")")
    const texte = await r.page.locator('[data-testid="mon-espace"]').innerText()
    verifier(texte.includes("ZZ Cuisinier") && texte.includes("ZE001"), "poste et matricule affichés")
    await r.ctx.close()
  })

  await etape("Connexion d'un parent avec son code : espace famille", async () => {
    const r = await tenterCode(ETAB, codes.parent.toLowerCase(), true)
    verifier(r.chemin === "/famille", "arrivée sur l'espace famille (obtenu " + r.chemin + " " + r.erreur + ")")
    await r.page.goto(BASE + "/famille", { waitUntil: "load" })
    await attendre(async () => /Awa/.test(await r.page.locator("body").innerText()), "l'enfant est listé")
    await r.ctx.close()
  })

  await etape("Régénération : l'ancien code est refusé, le nouveau fonctionne", async () => {
    await ligne("INSCRIT", "Awa ZZTest").locator('[data-testid="code-regenerer"]').click()
    await attendre(async () => (await codeDe("INSCRIT", "Awa ZZTest")) !== codes.awa, "nouveau code affiché")
    const nouveau = await codeDe("INSCRIT", "Awa ZZTest")
    verifier(REGEX_CODE.test(nouveau), "format du nouveau code")
    const vieux = await tenterCode(ETAB, codes.awa)
    verifier(vieux.chemin === "/login" && vieux.erreur !== "", "l'ancien code est refusé")
    const bon = await tenterCode(ETAB, nouveau)
    verifier(bon.chemin === "/mon-espace", "le nouveau code fonctionne")
    codes.awa = nouveau
  })

  await etape("Désactivation : le code est refusé jusqu'à sa réactivation", async () => {
    await ligne("INSCRIT", "Awa ZZTest").locator('[data-testid="code-basculer"]').click()
    await attendre(async () => (await ligne("INSCRIT", "Awa ZZTest").locator('[data-testid="code-valeur"]').getAttribute("data-actif")) === "0", "code désactivé")
    const refus = await tenterCode(ETAB, codes.awa)
    verifier(refus.chemin === "/login" && refus.erreur !== "", "code désactivé refusé")
    await ligne("INSCRIT", "Awa ZZTest").locator('[data-testid="code-basculer"]').click()
    await attendre(async () => (await ligne("INSCRIT", "Awa ZZTest").locator('[data-testid="code-valeur"]').getAttribute("data-actif")) === "1", "code réactivé")
    verifier((await tenterCode(ETAB, codes.awa)).chemin === "/mon-espace", "code réactivé accepté")
  })

  await etape("Mauvais établissement refusé ; blocage après plusieurs échecs", async () => {
    const autre = await tenterCode("ZZ-AUTRE", codes.yao)
    verifier(autre.chemin === "/login" && autre.erreur !== "", "établissement inconnu refusé")
    let bloque = false
    for (let i = 0; i < 8 && !bloque; i++) {
      const r = await tenterCode(ETAB, "AAAAA")
      bloque = /Trop de tentatives/.test(r.erreur)
    }
    verifier(bloque, "blocage anti force brute atteint")
    const apres = await tenterCode(ETAB, codes.yao)
    verifier(apres.chemin === "/login" && /Trop de tentatives/.test(apres.erreur), "même un bon code est refusé pendant le blocage")
  })
}

principal()
  .then(() => terminer(nettoyer, "CODES ACCES", 0))
  .catch((e) => {
    console.log("ERREUR : " + e.message)
    console.log("--- journal serveur ---\n" + journal.slice(-3500))
    return terminer(nettoyer, "CODES ACCES", 1)
  })