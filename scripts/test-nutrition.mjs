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

const PORT = 3125
const BASE = "http://localhost:" + PORT
const mdpGest = secret()
const mdpChef = secret()
const mdpMag = secret()
const mdpRh = secret()
const GEST = "test-nu-gest@miam.test"
const CHEF = "test-nu-chef@miam.test"
const MAG = "test-nu-mag@miam.test"
const RH = "test-nu-rh@miam.test"
const EMAILS = [GEST, CHEF, MAG, RH]
const iso = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)
const fr = (s) => s.split("-").reverse().join("/")
const lundiProchain = () => {
  let n = 7
  while (new Date(Date.now() + n * 864e5).getUTCDay() !== 1) n++
  return iso(n)
}

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: { in: EMAILS } } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-NU", name: "ZZ Cantine Nutrition", type: "SCHOOL", prepaye: true } })
  const E2 = await db.etablissement.create({ data: { code: "ZZ-NV", name: "ZZ Autre Nutrition", type: "SCHOOL", prepaye: true } })
  const creerUser = (email, name, role, mdp) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  await creerUser(GEST, "Test Nu Gest", "MANAGER", mdpGest)
  await creerUser(CHEF, "Test Nu Chef", "CHEF", mdpChef)
  await creerUser(MAG, "Test Nu Mag", "STOREKEEPER", mdpMag)
  await creerUser(RH, "Test Nu Rh", "HR", mdpRh)
  const ing = (etab, name, cout) => db.ingredient.create({ data: { etablissementId: etab.id, name, unit: "kg", unitCost: cout } })
  const riz = await ing(E, "ZZ Riz", 800)
  const poulet = await ing(E, "ZZ Poulet", 3000)
  const legume = await ing(E, "ZZ Legume", 500)
  const inconnu = await ing(E, "ZZ Inconnu", 100)
  const autre = await ing(E2, "ZZ Poulet Autre", 3000)
  await db.plat.create({
    data: {
      etablissementId: E.id,
      name: "ZZ Plat Riz Poulet",
      portions: 10,
      ingredients: { create: [{ ingredientId: riz.id, quantity: 1.5 }, { ingredientId: poulet.id, quantity: 1 }, { ingredientId: legume.id, quantity: 1 }] },
    },
  })
  await db.plat.create({ data: { etablissementId: E.id, name: "ZZ Plat Incomplet", portions: 10, ingredients: { create: [{ ingredientId: inconnu.id, quantity: 2 }] } } })
  await db.plat.create({ data: { etablissementId: E2.id, name: "ZZ Plat Autre Etab", portions: 10, ingredients: { create: [{ ingredientId: autre.id, quantity: 1 }] } } })

  process.env.CRON_SECRET = secret() + secret()
  await demarrer(BASE, PORT)
  const gest = await connecter(BASE, GEST, mdpGest)
  const chef = await connecter(BASE, CHEF, mdpChef)
  const mag = await connecter(BASE, MAG, mdpMag)
  const rh = await connecter(BASE, RH, mdpRh)
  const texte = (p, t) => p.getByText(t).filter({ visible: true }).first()
  const aller = async (p, chemin, testid) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
  }
  const valeurKpi = (p, nom) => p.locator('[data-kpi="' + nom + '"] p').nth(1).innerText()
  const saisir = async (p, o) => {
    const f = p.locator('[data-testid="form-valeurs"]:visible')
    await f.locator("#nu-ingredient").selectOption(o.ing ?? "")
    await f.locator("#nu-kcal").fill(o.kcal ?? "")
    await f.locator("#nu-proteines").fill(o.p ?? "")
    await f.locator("#nu-glucides").fill(o.g ?? "")
    await f.locator("#nu-lipides").fill(o.l ?? "")
    await f.locator("#nu-fibres").fill(o.f ?? "")
    await f.getByRole("button", { name: "Enregistrer les valeurs" }).click()
  }
  const debut = lundiProchain()
  const proposer = async (p, budget) => {
    const f = p.locator('[data-testid="form-propositions"]:visible')
    await f.locator("#pr-service").selectOption("LUNCH")
    await f.locator("#pr-debut").fill(debut)
    await f.locator("#pr-budget").fill(budget)
    await f.getByRole("button", { name: "Proposer des menus" }).click()
  }

  await etape("Accès : direction, cuisine et magasin voient la page ; la RH n'a ni la page ni l'entrée de menu", async () => {
    for (const p of [gest, chef, mag]) {
      await aller(p, "/nutrition", "nutrition-page")
      verifier((await p.locator('[data-testid="menu-principal"] a[href="/nutrition"]').count()) >= 1, "entrée de menu Nutrition")
    }
    await aller(rh, "/nutrition", "acces-refuse")
    verifier((await rh.locator('[data-testid="nutrition-page"]').count()) === 0, "la RH n'accède pas à la page")
    verifier((await rh.locator('[data-testid="menu-principal"] a[href="/nutrition"]').count()) === 0, "pas d'entrée de menu pour la RH")
  })

  await etape("Valeurs : saisies invalides refusées, saisie et import de référence, isolation entre établissements", async () => {
    await aller(gest, "/nutrition?vue=ingredients", "nutrition-page")
    verifier((await gest.locator('#nu-ingredient option[value="' + autre.id + '"]').count()) === 0, "l'ingrédient d'un autre établissement n'est pas proposé")
    verifier((await gest.locator('#nu-ingredient option[value="' + riz.id + '"]').count()) === 1, "l'ingrédient de l'établissement est proposé")
    await saisir(gest, { ing: "", kcal: "360", p: "7", g: "79", l: "0.6" })
    await texte(gest, "Choisissez un ingrédient").waitFor()
    await saisir(gest, { ing: riz.id, kcal: "5000", p: "7", g: "79", l: "0.6" })
    await texte(gest, "Énergie invalide").waitFor()
    await saisir(gest, { ing: riz.id, kcal: "400", p: "60", g: "60", l: "10" })
    await texte(gest, "dépassent 100 g").waitFor()
    verifier((await db.nutritionIngredient.count({ where: { ingredientId: riz.id } })) === 0, "rien n'est enregistré après les refus")
    await saisir(gest, { ing: riz.id, kcal: "360", p: "7", g: "79", l: "0.6", f: "1.3" })
    await texte(gest, "Valeurs enregistrées pour ZZ Riz.").waitFor()
    const n1 = await db.nutritionIngredient.findUnique({ where: { ingredientId: riz.id } })
    verifier(n1 && n1.kcal === 360 && Number(n1.proteines) === 7, "valeurs du riz en base")
    await gest.locator('[data-testid="form-import"]:visible').getByRole("button", { name: "Importer les valeurs de référence" }).click()
    await texte(gest, "Import terminé : 1 ingrédient(s) renseigné(s), 2 sans équivalent.").waitFor()
    const n2 = await db.nutritionIngredient.findUnique({ where: { ingredientId: poulet.id } })
    verifier(n2 && n2.kcal === 121, "valeurs du poulet importées")
    verifier((await db.nutritionIngredient.count({ where: { ingredientId: autre.id } })) === 0, "l'import ne touche pas l'autre établissement")
    await saisir(gest, { ing: legume.id, kcal: "20", p: "1", g: "4", l: "0.2", f: "1.5" })
    await texte(gest, "Valeurs enregistrées pour ZZ Legume.").waitFor()
    verifier((await db.nutritionIngredient.count({ where: { ingredientId: legume.id } })) === 1, "valeurs du légume en base")
  })

  await etape("Plats : valeurs par portion, score d'équilibre, plat incomplet signalé, autre établissement invisible", async () => {
    await aller(gest, "/nutrition?vue=plats", "table-plats")
    const ligneA = (await gest.locator('[data-plat="ZZ Plat Riz Poulet"]').first().innerText()).replace(/\s+/g, " ")
    verifier(ligneA.includes("681"), "énergie par portion attendue 681 : " + ligneA)
    verifier(ligneA.includes("32.4 g"), "protéines par portion attendues 32.4 g : " + ligneA)
    verifier(ligneA.includes("85 / 100"), "score attendu 85 / 100 : " + ligneA)
    verifier(ligneA.includes("Fibres insuffisantes"), "alerte fibres : " + ligneA)
    const ligneB = (await gest.locator('[data-plat="ZZ Plat Incomplet"]').first().innerText()).replace(/\s+/g, " ")
    verifier(ligneB.includes("Incomplet : 1 ingrédient(s) sans valeurs"), "plat incomplet signalé : " + ligneB)
    verifier((await gest.locator('[data-plat="ZZ Plat Autre Etab"]').count()) === 0, "plat d'un autre établissement invisible")
    verifier((await valeurKpi(gest, "plats-total")) === "2", "deux plats actifs")
    verifier((await valeurKpi(gest, "plats-complets")) === "1", "un plat complet")
    verifier((await valeurKpi(gest, "plats-incomplets")) === "1", "un plat à compléter")
  })

  await etape("Menus intelligents : budget respecté, six jours proposés, brouillons créés sans écraser l'existant", async () => {
    await aller(gest, "/nutrition?vue=menus", "nutrition-page")
    await proposer(gest, "100")
    await gest.locator('[data-testid="aucune-proposition"]:visible').waitFor()
    await proposer(gest, "1000")
    await gest.locator('[data-testid="propositions"]:visible').waitFor()
    const lignes = gest.locator("[data-proposition]")
    verifier((await lignes.count()) === 6, "six jours proposés, du lundi au samedi")
    for (let i = 0; i < 6; i++) verifier((await lignes.nth(i).innerText()).includes("ZZ Plat Riz Poulet"), "seul le plat complet est proposé")
    verifier((await lignes.first().innerText()).includes(fr(debut)), "la première proposition est le lundi choisi")
    verifier((await db.menu.count({ where: { etablissementId: E.id } })) === 0, "aucun menu créé par la simple proposition")
    await gest.locator('[data-testid="form-brouillons"]:visible').getByRole("button", { name: "Créer ces menus en brouillon" }).click()
    await texte(gest, "6 brouillon(s) de menu créé(s), 0 jour(s) déjà planifié(s).").waitFor()
    const menus = await db.menu.findMany({ where: { etablissementId: E.id }, include: { plats: true } })
    verifier(menus.length === 6, "six menus en base")
    verifier(menus.every((m) => m.statut === "DRAFT" && m.service === "LUNCH" && m.plats.length === 1), "brouillons à un plat")
    verifier((await db.menu.count({ where: { etablissementId: E2.id } })) === 0, "aucun menu dans l'autre établissement")
    await db.menu.update({ where: { id: menus[0].id }, data: { statut: "PUBLISHED" } })
    await gest.locator('[data-testid="form-brouillons"]:visible').getByRole("button", { name: "Créer ces menus en brouillon" }).click()
    await texte(gest, "0 brouillon(s) de menu créé(s), 6 jour(s) déjà planifié(s).").waitFor()
    verifier((await db.menu.count({ where: { etablissementId: E.id } })) === 6, "toujours six menus")
    const publie = await db.menu.findUnique({ where: { id: menus[0].id } })
    verifier(publie && publie.statut === "PUBLISHED", "un menu publié n'est jamais écrasé")
  })

  await etape("Rôles et traçabilité : magasin en lecture seule, cuisine peut saisir, accès anonyme refusé, audit écrit", async () => {
    await aller(mag, "/nutrition?vue=ingredients", "table-ingredients")
    verifier((await mag.locator('[data-testid="form-valeurs"]').count()) === 0, "le magasin ne voit pas le formulaire de saisie")
    verifier((await mag.locator('[data-testid="form-import"]').count()) === 0, "le magasin ne voit pas l'import")
    verifier((await mag.getByRole("button", { name: "Retirer" }).count()) === 0, "le magasin ne peut pas retirer de valeurs")
    await aller(chef, "/nutrition?vue=ingredients", "table-ingredients")
    verifier((await chef.locator('[data-testid="form-valeurs"]:visible').count()) === 1, "la cuisine voit le formulaire")
    verifier((await chef.locator('[data-testid="form-import"]:visible').count()) === 1, "la cuisine voit l'import")
    const r = await fetch(BASE + "/nutrition", { redirect: "manual" })
    verifier([301, 302, 303, 307, 308].includes(r.status), "accès anonyme redirigé, statut " + r.status)
    const compte = (action) => db.auditLog.count({ where: { userEmail: GEST, action } })
    verifier((await compte("NUTRITION_SAISIE")) >= 2, "audit des saisies")
    verifier((await compte("NUTRITION_IMPORT")) >= 1, "audit de l'import")
    verifier((await compte("NUTRITION_BROUILLONS")) >= 2, "audit des brouillons")
  })
}

principal()
  .then(() => terminer(nettoyer, "NUTRITION", 0))
  .catch((e) => {
    console.log("ERREUR : " + e.message)
    return terminer(nettoyer, "NUTRITION", 1)
  })