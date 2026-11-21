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

const PORT = 3142
const BASE = "http://localhost:" + PORT
const ETAB = "ZZ-MOB"
const ADMIN = "test-mobile-admin@miam.test"
const PARENT = "parent-mobile@miam.test"
const mdp = randomBytes(8).toString("hex") + "Zz9"
const IP_BLOC = "10.9.9.9"
const IP_OK = "10.1.1.1"

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
  await redis.del("rl:fail:" + ADMIN, "rl:blk:" + ADMIN, "rl:fail:code-ip:" + IP_BLOC, "rl:blk:code-ip:" + IP_BLOC, "rl:fail:code-ip:" + IP_OK, "rl:blk:code-ip:" + IP_OK, "rl:fail:code-etab:zz-mob", "rl:blk:code-etab:zz-mob", "rl:fail:code-global", "rl:blk:code-global")
}

async function api(chemin, { methode = "GET", jeton = "", corps = null, ip = IP_OK } = {}) {
  const entetes = { "x-forwarded-for": ip }
  if (jeton) entetes.authorization = "Bearer " + jeton
  if (corps) entetes["content-type"] = "application/json"
  const r = await fetch(BASE + "/api/mobile/v1" + chemin, { method: methode, headers: entetes, body: corps ? JSON.stringify(corps) : undefined })
  let data = null
  try {
    data = await r.json()
  } catch {}
  return { status: r.status, data }
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: ETAB, name: "ZZ Cantine Mobile", type: "SCHOOL", prepaye: true } })
  await db.user.create({ data: { email: ADMIN, name: "Test Mobile Admin", role: "ADMIN", passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  const badge = () => randomBytes(8).toString("hex").toUpperCase()
  const awa = await db.inscrit.create({ data: { etablissementId: E.id, matricule: "ZM001", firstName: "Awa", lastName: "ZZMob", badge: badge() } })
  const yao = await db.inscrit.create({ data: { etablissementId: E.id, matricule: "ZM002", firstName: "Yao", lastName: "ZZMob", badge: badge() } })
  await db.tuteur.create({ data: { inscritId: awa.id, name: "Parent Mobile", email: PARENT } })
  await db.employeRh.create({ data: { etablissementId: E.id, matricule: "ZE901", firstName: "Koffi", lastName: "ZZMobEmp", poste: "ZZ Plongeur", dateEmbauche: new Date("2024-01-15"), salaireBase: 100000 } })
  const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  await db.menu.create({ data: { etablissementId: E.id, date: new Date(demain + "T00:00:00.000Z"), service: "LUNCH", statut: "PUBLISHED" } })

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

  // Generation des codes par l'administrateur (comme dans l'ERP)
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
  await admin.goto(BASE + "/inscrits/codes", { waitUntil: "load" })
  await admin.waitForLoadState("networkidle").catch(() => {})
  await admin.locator('[data-testid="codes-generer"]').click()
  await attendre(async () => (await admin.locator('[data-testid="code-valeur"]').count()) === 4, "4 codes affichés")
  const codeDe = async (cible, nom) => (await admin.locator('[data-testid="code-ligne"][data-cible="' + cible + '"][data-nom="' + nom + '"] [data-testid="code-valeur"]').innerText()).trim()
  const codes = { awa: await codeDe("INSCRIT", "Awa ZZMob"), yao: await codeDe("INSCRIT", "Yao ZZMob"), emp: await codeDe("EMPLOYE", "Koffi ZZMobEmp"), parent: await codeDe("PARENT", PARENT) }
  await navigateur.close()
  navigateur = null

  const jetons = {}

  await etape("Connexion refusée sans bon code ; routes protégées sans jeton", async () => {
    const m = await api("/auth/code", { methode: "POST", corps: { etab: ETAB, code: "AAAAA" } })
    verifier(m.status === 401 && m.data && m.data.error, "mauvais code refusé (obtenu " + m.status + ")")
    verifier((await api("/me")).status === 401, "/me sans jeton")
    verifier((await api("/me", { jeton: "abc.def.ghi" })).status === 401, "jeton invalide")
    verifier((await api("/auth/code", { methode: "POST", corps: { etab: "ZZ-AUTRE", code: codes.awa } })).status === 401, "mauvais établissement")
  })

  await etape("Parent : connexion, enfants, menus, réserver, doublon, annuler, enfant d'un autre refusé", async () => {
    const c = await api("/auth/code", { methode: "POST", corps: { etab: ETAB, code: codes.parent.toLowerCase() } })
    verifier(c.status === 200 && c.data.token && c.data.role === "PARENT", "connexion parent (obtenu " + c.status + " " + JSON.stringify(c.data) + ")")
    jetons.parent = c.data.token
    const me = await api("/me", { jeton: jetons.parent })
    verifier(me.status === 200 && me.data.inscrits.length === 1 && me.data.inscrits[0].nom === "Awa ZZMob", "un seul enfant : Awa")
    const idAwa = me.data.inscrits[0].id
    const menus = await api("/menus?du=" + demain + "&au=" + demain, { jeton: jetons.parent })
    verifier(menus.status === 200 && menus.data.menus.length === 1 && menus.data.menus[0].service === "LUNCH", "menu de demain visible")
    const r1 = await api("/reservations", { methode: "POST", jeton: jetons.parent, corps: { inscritId: idAwa, date: demain, service: "LUNCH" } })
    verifier(r1.status === 200, "réservation (obtenu " + r1.status + " " + JSON.stringify(r1.data) + ")")
    verifier((await api("/reservations", { methode: "POST", jeton: jetons.parent, corps: { inscritId: idAwa, date: demain, service: "LUNCH" } })).status === 409, "doublon refusé")
    const liste = await api("/reservations?inscritId=" + idAwa, { jeton: jetons.parent })
    verifier(liste.data.reservations.some((r) => r.date === demain && r.statut === "BOOKED"), "réservation listée")
    verifier((await api("/reservations/annuler", { methode: "POST", jeton: jetons.parent, corps: { inscritId: idAwa, date: demain, service: "LUNCH" } })).status === 200, "annulation")
    verifier((await api("/reservations", { methode: "POST", jeton: jetons.parent, corps: { inscritId: yao.id, date: demain, service: "LUNCH" } })).status === 404, "enfant d'un autre refusé")
  })

  await etape("Élève : sa fiche, réservation pour lui seul", async () => {
    const c = await api("/auth/code", { methode: "POST", corps: { etab: ETAB, code: codes.yao } })
    verifier(c.status === 200 && c.data.role === "ELEVE", "connexion élève (obtenu " + c.status + ")")
    jetons.eleve = c.data.token
    const me = await api("/me", { jeton: jetons.eleve })
    verifier(me.data.inscrits.length === 1 && me.data.inscrits[0].matricule === "ZM002", "sa fiche")
    verifier((await api("/reservations", { methode: "POST", jeton: jetons.eleve, corps: { date: demain, service: "LUNCH" } })).status === 200, "réservation pour lui")
    verifier((await api("/reservations", { methode: "POST", jeton: jetons.eleve, corps: { inscritId: awa.id, date: demain, service: "LUNCH" } })).status === 404, "pas pour un autre élève")
  })

  await etape("Employé : poste et matricule, pas de réservation", async () => {
    const c = await api("/auth/code", { methode: "POST", corps: { etab: ETAB, code: codes.emp } })
    verifier(c.status === 200 && c.data.role === "EMPLOYE", "connexion employé (obtenu " + c.status + ")")
    jetons.emp = c.data.token
    const me = await api("/me", { jeton: jetons.emp })
    verifier(me.data.employe && me.data.employe.poste === "ZZ Plongeur" && me.data.employe.matricule === "ZE901", "poste et matricule")
    verifier((await api("/reservations", { methode: "POST", jeton: jetons.emp, corps: { date: demain, service: "LUNCH" } })).status === 403, "réservation refusée à l'employé")
  })

  await etape("Connexion avec le code seul (sans établissement) : l'établissement est renvoyé", async () => {
    const c = await api("/auth/code", { methode: "POST", corps: { code: codes.awa } })
    verifier(c.status === 200 && c.data.role === "ELEVE", "connexion code seul (obtenu " + c.status + " " + JSON.stringify(c.data) + ")")
    verifier(c.data.etablissement && c.data.etablissement.code === ETAB && c.data.etablissement.name === "ZZ Cantine Mobile", "établissement renvoyé")
    verifier((await api("/auth/code", { methode: "POST", corps: { etab: "ZZ-AUTRE", code: codes.awa } })).status === 401, "établissement fourni qui ne correspond pas : refusé")
    verifier((await api("/auth/code", { methode: "POST", corps: { code: "AAAAB" } })).status === 401, "code inconnu refusé")
  })
  await etape("Le jeton mobile n'ouvre pas une session web ; un jeton est révoqué si le compte change", async () => {
    const web = await fetch(BASE + "/famille", { redirect: "manual", headers: { cookie: "miam_session=" + jetons.parent } })
    verifier(web.status >= 300 && web.status < 400 && (web.headers.get("location") ?? "").includes("/login"), "redirigé vers /login (obtenu " + web.status + ")")
    await db.user.update({ where: { email: PARENT }, data: { tokenVersion: { increment: 1 } } })
    verifier((await api("/me", { jeton: jetons.parent })).status === 401, "jeton révoqué après changement de tokenVersion")
  })

  await etape("Blocage anti force brute sur la connexion mobile", async () => {
    let bloque = false
    for (let i = 0; i < 8 && !bloque; i++) {
      const r = await api("/auth/code", { methode: "POST", corps: { etab: ETAB, code: "AAAAA" }, ip: IP_BLOC })
      bloque = r.status === 429
    }
    verifier(bloque, "blocage atteint (429)")
    const apres = await api("/auth/code", { methode: "POST", corps: { etab: ETAB, code: codes.yao }, ip: IP_BLOC })
    verifier(apres.status === 429, "même un bon code est refusé pendant le blocage")
  })
}

principal()
  .then(() => terminer(nettoyer, "MOBILE API", 0))
  .catch((e) => {
    console.log("ERREUR : " + e.message)
    console.log("--- journal serveur ---\n" + journal.slice(-3500))
    return terminer(nettoyer, "MOBILE API", 1)
  })