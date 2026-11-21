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

const PORT = 3123
const BASE = "http://localhost:" + PORT
const mdpGest = secret()
const mdpCaisse = secret()
const mdpRh = secret()
const GEST = "test-sa-gest@miam.test"
const CAISSE = "test-sa-caisse@miam.test"
const RH = "test-sa-rh@miam.test"
const EMAILS = [GEST, CAISSE, RH]
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
  const E = await db.etablissement.create({ data: { code: "ZZ-SA", name: "ZZ Cantine Satisfaction", type: "SCHOOL", prepaye: true } })
  const E2 = await db.etablissement.create({ data: { code: "ZZ-SB", name: "ZZ Autre Satisfaction", type: "SCHOOL", prepaye: true } })
  const creerUser = (email, name, role, mdp) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  const uGest = await creerUser(GEST, "Test Sa Gest", "MANAGER", mdpGest)
  await creerUser(CAISSE, "Test Sa Caisse", "CASHIER", mdpCaisse)
  await creerUser(RH, "Test Sa Rh", "HR", mdpRh)
  const platA = await db.plat.create({ data: { etablissementId: E.id, name: "ZZ Plat A" } })
  const platB = await db.plat.create({ data: { etablissementId: E.id, name: "ZZ Plat B" } })
  const platX = await db.plat.create({ data: { etablissementId: E2.id, name: "ZZ Plat Autre" } })
  await db.avis.create({ data: { etablissementId: E2.id, date: dateDb(iso(0)), service: "LUNCH", platId: platX.id, platNom: "ZZ Plat Autre", note: 5, source: "PARENT" } })
  await db.suggestion.create({ data: { etablissementId: E2.id, titre: "ZZ Suggestion autre etablissement" } })

  process.env.CRON_SECRET = secret() + secret()
  await demarrer(BASE, PORT)
  const gest = await connecter(BASE, GEST, mdpGest)
  const caisse = await connecter(BASE, CAISSE, mdpCaisse)
  const rh = await connecter(BASE, RH, mdpRh)
  const texte = (p, t) => p.getByText(t).filter({ visible: true }).first()
  const aller = async (p, chemin, testid) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
  }
  const kpi = (p, nom) => p.locator('[data-kpi="' + nom + '"]').first().innerText()
  const saisirAvis = async (p, o) => {
    const f = p.locator('[data-testid="form-avis"]:visible')
    await f.evaluate((el) => { el.noValidate = true })
    await f.locator("#av-date").fill(o.date ?? iso(0))
    await f.locator("#av-service").selectOption("LUNCH")
    await f.locator("#av-plat").selectOption(o.plat ?? "")
    await f.locator("#av-note").selectOption(o.note ?? "")
    await f.locator("#av-source").selectOption(o.source ?? "COMPTOIR")
    await f.locator("#av-auteur").fill(o.auteur ?? "")
    await f.locator("#av-commentaire").fill(o.commentaire ?? "")
    await f.getByRole("button", { name: "Enregistrer l'avis" }).click()
  }
  const proposer = async (p, titre, detail = "") => {
    const f = p.locator('[data-testid="form-suggestion"]:visible')
    await f.evaluate((el) => { el.noValidate = true })
    await f.locator("#sg-titre").fill(titre)
    await f.locator("#sg-auteur").fill("")
    await f.locator("#sg-detail").fill(detail)
    await f.getByRole("button", { name: "Proposer" }).click()
  }

  await etape("Accès : direction et caisse ; la RH n'a ni la page ni l'entrée de menu", async () => {
    await aller(gest, "/satisfaction", "satisfaction-page")
    verifier((await gest.locator('[data-testid="form-avis"]:visible').count()) === 1, "la direction voit le formulaire d'avis")
    verifier((await gest.locator('[data-testid="menu-principal"] a[href="/satisfaction"]').count()) >= 1, "entrée de menu pour la direction")
    await aller(caisse, "/satisfaction", "satisfaction-page")
    verifier((await caisse.locator('[data-testid="form-avis"]:visible').count()) === 1, "la caisse peut saisir un avis")
    await aller(rh, "/satisfaction", "acces-refuse")
    verifier((await rh.locator('[data-testid="satisfaction-page"]').count()) === 0, "la RH n'accède pas à la page")
    verifier((await rh.locator('[data-testid="menu-principal"] a[href="/satisfaction"]').count()) === 0, "pas d'entrée de menu pour la RH")
  })

  await etape("Avis : note, date, commentaire et plat invalides refusés ; cinq avis enregistrés ; statistiques", async () => {
    await aller(caisse, "/satisfaction?vue=avis", "satisfaction-page")
    await saisirAvis(caisse, { note: "" })
    await texte(caisse, "Note invalide").waitFor()
    await saisirAvis(caisse, { note: "3", date: iso(1) })
    await texte(caisse, "Date invalide").waitFor()
    await saisirAvis(caisse, { note: "3", commentaire: "x".repeat(501) })
    await texte(caisse, "Commentaire trop long").waitFor()
    const f = caisse.locator('[data-testid="form-avis"]:visible')
    await f.locator("#av-plat").evaluate((el, id) => {
      const o = document.createElement("option")
      o.value = id
      o.text = "Plat d'un autre établissement"
      el.appendChild(o)
    }, platX.id)
    await saisirAvis(caisse, { note: "3", plat: platX.id })
    await texte(caisse, "Plat introuvable").waitFor()
    verifier((await db.avis.count({ where: { etablissementId: E.id } })) === 0, "rien n'est enregistré par les refus")
    await saisirAvis(caisse, { note: "5", plat: platA.id, source: "ELEVE", auteur: "Awa" })
    await texte(caisse, "(1 au total)").waitFor()
    await saisirAvis(caisse, { note: "4", plat: platA.id, source: "PARENT", commentaire: "Très bon" })
    await texte(caisse, "(2 au total)").waitFor()
    await saisirAvis(caisse, { note: "2", plat: platB.id })
    await texte(caisse, "(3 au total)").waitFor()
    await saisirAvis(caisse, { note: "1", plat: platB.id })
    await texte(caisse, "(4 au total)").waitFor()
    await saisirAvis(caisse, { note: "3" })
    await texte(caisse, "(5 au total)").waitFor()
    const a = await db.avis.findFirst({ where: { etablissementId: E.id, note: 5 } })
    verifier(a && a.platNom === "ZZ Plat A" && a.source === "ELEVE" && a.auteur === "Awa", "l'avis garde le nom du plat, la source et l'auteur")
    await aller(caisse, "/satisfaction?vue=avis", "satisfaction-page")
    verifier(/\b5\b/.test(await kpi(caisse, "avis-nombre")), "cinq avis")
    verifier(/3,0/.test(await kpi(caisse, "avis-moyenne")), "note moyenne 3,0")
    verifier(/40\s*%/.test(await kpi(caisse, "avis-satisfaits")), "40 % de satisfaits")
    verifier((await caisse.locator('tr[data-plat-note][data-plat="ZZ Plat A"]').getAttribute("data-moyenne")) === "45", "plat A : 4,5")
    verifier((await caisse.locator('tr[data-plat-note][data-plat="ZZ Plat B"]').getAttribute("data-moyenne")) === "15", "plat B : 1,5")
  })

  await etape("Modération : seule la direction supprime un avis", async () => {
    await aller(caisse, "/satisfaction?vue=avis", "satisfaction-page")
    verifier((await caisse.locator('tr[data-avis]').count()) === 5, "la caisse voit les cinq avis")
    verifier((await caisse.getByRole("button", { name: "Supprimer" }).count()) === 0, "la caisse n'a pas de bouton de suppression")
    await aller(gest, "/satisfaction?vue=avis", "satisfaction-page")
    await gest.locator('tr[data-avis][data-note="3"]').getByRole("button", { name: "Supprimer" }).click()
    await attendre(async () => (await db.avis.count({ where: { etablissementId: E.id } })) === 4, "avis supprimé")
    verifier((await db.avis.count({ where: { etablissementId: E.id, note: 3 } })) === 0, "c'est bien l'avis noté 3")
  })

  await etape("Suggestions : doublon et titre refusés ; traitement par la direction uniquement", async () => {
    await aller(caisse, "/satisfaction?vue=suggestions", "satisfaction-page")
    await proposer(caisse, "ab")
    await texte(caisse, "Titre trop court").waitFor()
    await proposer(caisse, "ZZ Plus de légumes frais", "Des légumes de saison au moins deux fois par semaine.")
    await texte(caisse, "Suggestion enregistrée").waitFor()
    await proposer(caisse, "zz plus de légumes frais")
    await texte(caisse, "déjà en cours").waitFor()
    verifier((await db.suggestion.count({ where: { etablissementId: E.id } })) === 1, "une seule suggestion")
    verifier((await caisse.locator('select[name="statut"]').count()) === 0, "la caisse ne peut pas traiter")
    const s = await db.suggestion.findFirst({ where: { etablissementId: E.id } })
    await aller(gest, "/satisfaction?vue=suggestions", "satisfaction-page")
    const ligne = gest.locator('tr[data-suggestion="' + s.id + '"]')
    await ligne.locator('select[name="statut"]').selectOption("TRAITEE")
    await ligne.locator('input[name="reponse"]').fill("Ajouté au menu dès la semaine prochaine")
    await ligne.getByRole("button", { name: "Enregistrer" }).click()
    await attendre(async () => (await db.suggestion.findUnique({ where: { id: s.id } })).statut === "TRAITEE", "suggestion traitée")
    const apres = await db.suggestion.findUnique({ where: { id: s.id } })
    verifier(apres.traitePar === uGest.id && apres.reponse === "Ajouté au menu dès la semaine prochaine", "réponse et auteur du traitement enregistrés")
    await aller(gest, "/satisfaction?vue=suggestions", "satisfaction-page")
    verifier(/\b1\b/.test(await kpi(gest, "sug-traitees")), "une suggestion traitée")
  })

  await etape("Audit et isolation entre établissements", async () => {
    verifier(!!(await db.auditLog.findFirst({ where: { action: "AVIS_ENREGISTRE", userEmail: CAISSE } })), "audit AVIS_ENREGISTRE")
    verifier(!!(await db.auditLog.findFirst({ where: { action: "SUGGESTION_CREEE", userEmail: CAISSE } })), "audit SUGGESTION_CREEE")
    verifier(!!(await db.auditLog.findFirst({ where: { action: "AVIS_SUPPRIME", userEmail: GEST } })), "audit AVIS_SUPPRIME")
    verifier(!!(await db.auditLog.findFirst({ where: { action: "SUGGESTION_TRAITEE", userEmail: GEST } })), "audit SUGGESTION_TRAITEE")
    await aller(gest, "/satisfaction?vue=avis", "satisfaction-page")
    verifier((await gest.locator('tr[data-plat="ZZ Plat Autre"]').count()) === 0, "l'avis de l'autre établissement est invisible")
    verifier((await gest.locator('#av-plat option[value="' + platX.id + '"]').count()) === 0, "le plat de l'autre établissement n'est pas proposé")
    await aller(gest, "/satisfaction?vue=suggestions", "satisfaction-page")
    verifier((await gest.locator('tr[data-titre="ZZ Suggestion autre etablissement"]').count()) === 0, "la suggestion de l'autre établissement est invisible")
  })

  await terminer(nettoyer, "SATISFACTION", 0)
}

principal().catch(async (e) => {
  console.error("Echec : " + (e && e.message ? e.message : e))
  await terminer(nettoyer, "SATISFACTION", 1)
})