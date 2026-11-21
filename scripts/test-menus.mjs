import "dotenv/config"
import { randomBytes } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"

import { PrismaPg } from "@prisma/adapter-pg"
import * as bcryptModule from "bcryptjs"
import Redis from "ioredis"
import { chromium } from "playwright"

import { PrismaClient } from "../src/generated/prisma/client.ts"

const bcrypt = bcryptModule.default ?? bcryptModule
const PORT = 3105
const BASE = "http://localhost:" + PORT
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const redis = new Redis(process.env.REDIS_URL)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const secret = () => randomBytes(8).toString("hex") + "Zz9"
const mdpChef = secret()
const mdpMgr2 = secret()
const mdpMag = secret()
const mdpCaisse = secret()
const CHEF = "test-mn-chef@miam.test"
const MGR2 = "test-mn-mgr2@miam.test"
const MAG = "test-mn-mag@miam.test"
const CAISSE = "test-mn-caisse@miam.test"
const EMAILS = [CHEF, MGR2, MAG, CAISSE]
const LUNDI = "2030-03-04"
const LUNDI_SUIVANT = "2030-03-11"

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
const dateUtc = (iso) => new Date(iso + "T00:00:00.000Z")

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { OR: [{ userEmail: { in: EMAILS } }, { details: { contains: "ZZ" } }] } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  verifier(dateUtc(LUNDI).getUTCDay() === 1 && dateUtc(LUNDI_SUIVANT).getUTCDay() === 1, "les dates de test sont des lundis")
  console.log("Preparation...")
  await nettoyer()
  const IA = await db.etablissement.create({ data: { code: "ZZ-MA", name: "ZZ Ecole MA", type: "SCHOOL" } })
  const IB = await db.etablissement.create({ data: { code: "ZZ-MB", name: "ZZ Ecole MB", type: "SCHOOL" } })
  const creerUser = (email, name, role, mdp, etab) =>
    db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: etab.id }] } } })
  await creerUser(CHEF, "Test Mn Chef", "CHEF", mdpChef, IA)
  await creerUser(MGR2, "Test Mn Mgr2", "MANAGER", mdpMgr2, IB)
  await creerUser(MAG, "Test Mn Mag", "STOREKEEPER", mdpMag, IA)
  await creerUser(CAISSE, "Test Mn Caisse", "CASHIER", mdpCaisse, IA)

  const arachide = await db.referentiel.create({ data: { etablissementId: IA.id, kind: "ALLERGIE", name: "ZZ Arachide" } })
  const inscrit = (matricule, statutIns) =>
    db.inscrit.create({
      data: { etablissementId: IA.id, matricule, firstName: "Mn", lastName: matricule, badge: "ZZM" + matricule.replace(/\D/g, "").padStart(13, "0"), statut: statutIns, allergies: { create: [{ allergieId: arachide.id }] } },
    })
  await inscrit("ZZM-1", "ACTIVE")
  await inscrit("ZZM-2", "ACTIVE")
  await inscrit("ZZM-3", "SUSPENDED")

  serveur = spawn("npx", ["next", "start", "-p", String(PORT)], { shell: true, cwd: process.cwd(), env: process.env, stdio: "ignore" })
  await attendre(async () => {
    try {
      return (await fetch(BASE + "/api/sante")).ok
    } catch {
      return false
    }
  }, "demarrage du serveur", 60000)
  navigateur = await chromium.launch()
  const chef = await connecter(CHEF, mdpChef)

  let farine, beurre, eau, plat
  await etape("Ingrédients : validations, création avec allergène, doublon refusé", async () => {
    await ouvrir("/menus/ingredients", chef)
    const creer = async (nom, unite, cout, allergenes = []) => {
      await chef.locator("#ing-nom").fill(nom)
      await chef.locator("#ing-unite").selectOption(unite)
      await chef.locator("#ing-cout").fill(cout)
      for (const id of allergenes) await chef.locator('input[name="allergenes"][value="' + id + '"]').check()
      await chef.getByRole("button", { name: "Créer l'ingrédient" }).click()
    }
    const trouver = (name) => db.ingredient.findFirst({ where: { etablissementId: IA.id, name }, include: { allergens: true } })
    await creer("", "kg", "100")
    await alerte(chef, "nom est obligatoire")
    await creer("ZZ Farine", "kg", "abc")
    await alerte(chef, "Coût unitaire invalide")
    await creer("ZZ Farine", "kg", "800")
    farine = await attendre(() => trouver("ZZ Farine"), "farine créée")
    verifier(Number(farine.unitCost) === 800 && farine.unit === "kg", "coût et unité de la farine")
    await creer("ZZ Farine", "kg", "900")
    await alerte(chef, "existe déjà")
    await creer("ZZ Beurre de cacahuète", "kg", "4000", [arachide.id])
    beurre = await attendre(() => trouver("ZZ Beurre de cacahuète"), "beurre de cacahuète créé")
    verifier(beurre.allergens.length === 1 && beurre.allergens[0].allergieId === arachide.id, "allergène enregistré")
    await creer("ZZ Eau", "l", "0")
    eau = await attendre(() => trouver("ZZ Eau"), "eau créée")
  })

  await etape("Plats : portions invalides refusées, recette, coût par portion et allergènes calculés", async () => {
    await ouvrir("/menus/plats", chef)
    await chef.locator("#plat-nom").fill("ZZ Gâteau")
    await chef.locator("#plat-portions").fill("0")
    await chef.getByRole("button", { name: "Créer le plat" }).click()
    await alerte(chef, "Portions invalides")
    await chef.locator("#plat-portions").fill("10")
    await chef.getByRole("button", { name: "Créer le plat" }).click()
    plat = await attendre(() => db.plat.findFirst({ where: { etablissementId: IA.id, name: "ZZ Gâteau" } }), "plat créé")

    await ouvrir("/menus/plats/" + plat.id, chef)
    const ajouter = async (ingredientId, quantite) => {
      await chef.locator("#ligne-ingredient").selectOption(ingredientId)
      await chef.locator("#ligne-qte").fill(quantite)
      await chef.getByRole("button", { name: "Ajouter l'ingrédient" }).click()
    }
    const coutPortion = () => chef.locator('[data-testid="cout-portion"]').getAttribute("data-cout")
    await ajouter(farine.id, "0")
    await alerte(chef, "Quantité invalide")
    await ajouter(farine.id, "2")
    await ajouter(beurre.id, "0,5")
    await attendre(async () => (await db.platIngredient.count({ where: { platId: plat.id } })) === 2, "deux lignes de recette")
    await attendre(async () => (await coutPortion()) === "360", "coût par portion = 360")
    await chef.locator('[data-testid="allergenes-plat"]').filter({ hasText: "ZZ Arachide" }).waitFor()
    await chef.locator('li[data-ligne="ZZ Beurre de cacahuète"]').getByRole("button", { name: "Retirer" }).click()
    await attendre(async () => (await coutPortion()) === "160", "coût par portion = 160 sans le beurre")
    await chef.locator('[data-testid="allergenes-plat"]').filter({ hasText: "aucun" }).waitFor()
    await ajouter(beurre.id, "0,5")
    await attendre(async () => (await coutPortion()) === "360", "coût par portion = 360 de nouveau")
  })

  await etape("Menu : ajout du plat, allergènes avec inscrits concernés, publication verrouillée, dépublication", async () => {
    const chemin = "/menus/jour/" + LUNDI + "/LUNCH"
    const trouverMenu = () => db.menu.findUnique({ where: { etablissementId_date_service: { etablissementId: IA.id, date: dateUtc(LUNDI), service: "LUNCH" } }, include: { plats: true } })
    await ouvrir(chemin, chef)
    await chef.locator("#menu-plat").selectOption(plat.id)
    await chef.getByRole("button", { name: "Ajouter au menu" }).click()
    const menu = await attendre(async () => {
      const m = await trouverMenu()
      return m && m.plats.length === 1 ? m : null
    }, "menu créé avec un plat")
    verifier(menu.statut === "DRAFT", "le menu est créé en brouillon")
    await chef.locator('[data-testid="cout-convive"][data-cout="360"]').waitFor()
    const li = chef.locator('li[data-allergene="ZZ Arachide"]')
    await li.waitFor()
    verifier((await li.innerText()).includes("2 inscrit"), "2 inscrits actifs concernés (le suspendu n'est pas compté)")

    await chef.getByRole("button", { name: "Publier le menu" }).click()
    await attendre(async () => (await trouverMenu()).statut === "PUBLISHED", "menu publié")
    await chef.locator('[data-testid="menu-jour"][data-statut="PUBLISHED"]').waitFor()
    verifier((await chef.locator("#menu-plat").count()) === 0, "pas d'ajout sur un menu publié")
    verifier((await chef.locator('li[data-plat] button').count()) === 0, "pas de retrait sur un menu publié")

    await chef.getByRole("button", { name: "Dépublier le menu" }).click()
    await attendre(async () => (await trouverMenu()).statut === "DRAFT", "menu dépublié")
    await chef.locator('li[data-plat="ZZ Gâteau"]').getByRole("button", { name: "Retirer" }).click()
    await attendre(async () => (await trouverMenu()).plats.length === 0, "plat retiré")
    await chef.getByRole("button", { name: "Publier le menu" }).click()
    await alerte(chef, "au moins un plat")
    await chef.locator("#menu-plat").selectOption(plat.id)
    await chef.getByRole("button", { name: "Ajouter au menu" }).click()
    await attendre(async () => (await trouverMenu()).plats.length === 1, "plat remis")
  })

  await etape("Planning : grille de la semaine, copie vers la semaine suivante sans écrasement", async () => {
    await ouvrir("/menus?semaine=" + LUNDI, chef)
    await chef.locator('[data-cell="' + LUNDI + '_LUNCH"]').filter({ hasText: "ZZ Gâteau" }).waitFor()
    await ouvrir("/menus?semaine=" + LUNDI_SUIVANT, chef)
    verifier(!(await chef.locator('[data-cell="' + LUNDI_SUIVANT + '_LUNCH"]').innerText()).includes("ZZ Gâteau"), "semaine suivante vide avant la copie")
    await chef.getByRole("button", { name: "Copier la semaine précédente" }).click()
    await statut(chef, "copié")
    const copie = await db.menu.findUnique({ where: { etablissementId_date_service: { etablissementId: IA.id, date: dateUtc(LUNDI_SUIVANT), service: "LUNCH" } }, include: { plats: true } })
    verifier(copie && copie.statut === "DRAFT" && copie.plats.length === 1, "menu copié en brouillon avec son plat")
    await chef.getByRole("button", { name: "Copier la semaine précédente" }).click()
    await statut(chef, "Aucun menu")
    verifier((await db.menu.count({ where: { etablissementId: IA.id, date: dateUtc(LUNDI_SUIVANT) } })) === 1, "aucun doublon créé par une seconde copie")
  })

  await etape("Droits et isolation : autre établissement, magasinier en lecture, caissier refusé", async () => {
    const p2 = await connecter(MGR2, mdpMgr2)
    await ouvrir("/menus/plats", p2)
    await p2.locator('[data-testid="liste-plats"]').waitFor()
    verifier((await p2.locator('tr[data-plat="ZZ Gâteau"]').count()) === 0, "le plat de A est invisible depuis B")
    await p2.goto(BASE + "/menus/plats/" + plat.id, { waitUntil: "load" })
    await cheminAttendu(p2, "/menus/plats", "fiche d'un autre établissement refusée")
    await ouvrir("/menus/jour/" + LUNDI + "/LUNCH", p2)
    await p2.locator('[data-testid="menu-jour"][data-statut="NONE"]').waitFor()
    await p2.context().close()

    const m = await connecter(MAG, mdpMag)
    await ouvrir("/menus/plats", m)
    await m.locator('tr[data-plat="ZZ Gâteau"]').waitFor()
    verifier((await m.locator('[data-testid="form-plat"]').count()) === 0, "pas de création pour le magasinier")
    await ouvrir("/menus/plats/" + plat.id, m)
    await m.locator('[data-testid="cout-portion"]').waitFor()
    verifier((await m.locator("#plat-nom").count()) === 0 && (await m.locator("#ligne-ingredient").count()) === 0, "fiche en lecture seule")
    await ouvrir("/menus?semaine=" + LUNDI, m)
    await m.locator('[data-cell="' + LUNDI + '_LUNCH"]').filter({ hasText: "ZZ Gâteau" }).waitFor()
    verifier((await m.getByRole("button", { name: "Copier la semaine précédente" }).count()) === 0, "pas de copie pour le magasinier")
    await m.context().close()

    const c = await connecter(CAISSE, mdpCaisse)
    await c.goto(BASE + "/menus", { waitUntil: "load" })
    await cheminAttendu(c, "/", "le caissier n'a pas accès aux menus")
    await c.context().close()
  })

  await etape("Suppressions protégées, ingrédient libre supprimé, audit complet", async () => {
    await ouvrir("/menus/plats/" + plat.id, chef)
    await chef.getByRole("button", { name: "Supprimer le plat" }).click()
    await alerte(chef, "suppression impossible")
    verifier(!!(await db.plat.findUnique({ where: { id: plat.id } })), "le plat utilisé est conservé")
    await ouvrir("/menus/ingredients/" + farine.id, chef)
    await chef.getByRole("button", { name: "Supprimer l'ingrédient" }).click()
    await alerte(chef, "suppression impossible")
    await ouvrir("/menus/ingredients/" + eau.id, chef)
    await chef.getByRole("button", { name: "Supprimer l'ingrédient" }).click()
    await cheminAttendu(chef, "/menus/ingredients", "retour à la liste après suppression")
    verifier(!(await db.ingredient.findUnique({ where: { id: eau.id } })), "ingrédient libre supprimé")
    for (const action of ["INGREDIENT_CREATED", "INGREDIENT_DELETED", "PLAT_CREATED", "PLAT_INGREDIENT_ADDED", "MENU_PLAT_ADDED", "MENU_PUBLISHED", "MENU_UNPUBLISHED", "MENU_WEEK_COPIED"]) {
      verifier(!!(await db.auditLog.findFirst({ where: { action } })), "audit " + action + " attendu")
    }
  })

  await chef.context().close()
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
console.log(code === 0 ? "=== TESTS MENUS OK ===" : "=== TESTS MENUS ECHEC ===")
process.exit(code)