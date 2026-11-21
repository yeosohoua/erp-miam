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
const iso = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
const dateDb = (s) => new Date(s + "T00:00:00.000Z")

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

const PORT = 3118
const BASE = "http://localhost:" + PORT
const mdpChef = secret()
const mdpAchat = secret()
const mdpCompta = secret()
const mdpCaisse = secret()
const CHEF = "test-pr-chef@miam.test"
const ACHAT = "test-pr-achat@miam.test"
const COMPTA = "test-pr-compta@miam.test"
const CAISSE = "test-pr-caisse@miam.test"
const EMAILS = [CHEF, ACHAT, COMPTA, CAISSE]
const CIBLE = iso(3)
const HIER = iso(-1)

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: { in: EMAILS } } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

const chiffres = (s) => Number(String(s).replace(/\D/g, ""))

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-PR", name: "ZZ Cantine Production", type: "SCHOOL" } })
  const E2 = await db.etablissement.create({ data: { code: "ZZ-PS", name: "ZZ Autre Production", type: "SCHOOL" } })
  const creerUser = (email, name, role, mdp) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  await creerUser(CHEF, "Test Pr Chef", "CHEF", mdpChef)
  await creerUser(ACHAT, "Test Pr Achat", "PURCHASER", mdpAchat)
  await creerUser(COMPTA, "Test Pr Compta", "ACCOUNTANT", mdpCompta)
  await creerUser(CAISSE, "Test Pr Caisse", "CASHIER", mdpCaisse)

  // Donnees posees : trois memes jours de la semaine servis 120, 100 et 80 repas => prevu 103 (intervalle 77 a 129).
  for (const [jours, repas] of [[-4, 120], [-11, 100], [-18, 80]]) {
    await db.consommation.create({ data: { etablissementId: E.id, date: dateDb(iso(jours)), service: "LUNCH", repas } })
  }
  const riz = await db.ingredient.create({ data: { etablissementId: E.id, name: "ZZ Riz", unit: "kg", unitCost: 1000, stock: 20, seuil: 10 } })
  const oignon = await db.ingredient.create({ data: { etablissementId: E.id, name: "ZZ Oignon", unit: "kg", unitCost: 500, stock: 500, seuil: 0 } })
  const platA = await db.plat.create({ data: { etablissementId: E.id, name: "ZZ Plat Riz", portions: 1, ingredients: { create: [{ ingredientId: riz.id, quantity: 0.5 }] } } })
  const platB = await db.plat.create({ data: { etablissementId: E.id, name: "ZZ Plat Oignon", portions: 1, ingredients: { create: [{ ingredientId: oignon.id, quantity: 0.2 }] } } })
  await db.menu.create({ data: { etablissementId: E.id, date: dateDb(CIBLE), service: "LUNCH", statut: "PUBLISHED", plats: { create: [{ platId: platA.id }, { platId: platB.id }] } } })
  const fournisseur = await db.fournisseur.create({ data: { etablissementId: E.id, name: "ZZ Fournisseur" } })
  // Un plan passe (prevu 100, produit 120) et le repas reellement servi (90) : surplus 30, ecart 11 %.
  await db.consommation.create({ data: { etablissementId: E.id, date: dateDb(HIER), service: "LUNCH", repas: 90 } })
  await db.planProduction.create({ data: { etablissementId: E.id, date: dateDb(HIER), service: "LUNCH", prevus: 100, aProduire: 120 } })
  // Donnees d'un autre etablissement, qui ne doivent jamais apparaitre.
  await db.gaspillage.create({ data: { etablissementId: E2.id, date: dateDb(HIER), service: "LUNCH", platNom: "ZZ Autre Plat", portions: 99, coutPortion: 1000, cout: 99000, type: "INVENDU" } })
  await db.evenementCantine.create({ data: { etablissementId: E2.id, type: "EVENEMENT", debut: dateDb(CIBLE), fin: dateDb(CIBLE), impactPct: -100, libelle: "ZZ Autre Evenement" } })

  process.env.CRON_SECRET = secret() + secret()
  await demarrer(BASE, PORT)
  const chef = await connecter(BASE, CHEF, mdpChef)
  const achat = await connecter(BASE, ACHAT, mdpAchat)
  const texte = (p, t) => p.getByText(t).filter({ visible: true }).first()
  const aller = async (p, testid = "production-page") => {
    await p.goto(BASE + "/production", { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
  }
  const ligne = (p) => p.locator('tr[data-prevision][data-date="' + CIBLE + '"][data-service="LUNCH"]:visible')
  const attr = async (loc, nom) => Number(await loc.getAttribute(nom))
  const kpi = async (p, id) => (await p.locator('[data-testid="' + id + '"]:visible').innerText()).trim()
  const rizCommande = (p) => p.locator('tr[data-ingredient="ZZ Riz"]:visible')

  await etape("Accès : chef et achats voient la page, caissier et comptable non ; entrée de menu selon le rôle", async () => {
    await aller(chef)
    await aller(achat)
    const caisse = await connecter(BASE, CAISSE, mdpCaisse)
    await aller(caisse, "acces-refuse")
    verifier((await caisse.locator('[data-testid="production-page"]').count()) === 0, "le caissier ne voit pas la production")
    const cpt = await connecter(BASE, COMPTA, mdpCompta)
    await aller(cpt, "acces-refuse")
    verifier((await chef.locator('[data-testid="menu-principal"] a[href="/production"]').count()) >= 1, "le chef a l'entrée Production")
    verifier((await caisse.locator('[data-testid="menu-principal"] a[href="/production"]').count()) === 0, "le caissier n'a pas l'entrée Production")
    verifier((await achat.locator('[data-testid="form-gaspillage"]').count()) === 0, "les achats ne saisissent pas de gaspillage")
    verifier((await achat.locator('[data-testid="form-evenement"]').count()) === 0, "les achats ne saisissent pas d'événement")
    verifier((await chef.locator('[data-testid="form-bon"]').count()) === 0, "le chef ne génère pas de bon de commande")
  })

  await etape("Prévision : 103 repas (77 à 129), confiance moyenne, aucun événement d'un autre établissement", async () => {
    await aller(chef)
    const l = ligne(chef)
    verifier((await attr(l, "data-prevu")) === 103, "prévu 103")
    verifier((await attr(l, "data-bas")) === 77 && (await attr(l, "data-haut")) === 129, "intervalle 77 à 129")
    verifier((await l.getAttribute("data-confiance")) === "MOYENNE", "confiance moyenne")
    verifier((await attr(l, "data-reserves")) === 0, "aucune réservation")
    verifier((await kpi(chef, "kpi-prevus")) === "103" && (await kpi(chef, "kpi-creneaux")) === "1", "indicateurs 103 repas, 1 créneau")
    verifier((await chef.getByText("ZZ Autre Evenement").count()) === 0 && (await chef.getByText("ZZ Autre Plat").count()) === 0, "rien d'un autre établissement")
  })

  await etape("Réservations : une réservation à trois jours pèse 60 % dans la prévision (42)", async () => {
    const inscrit = await db.inscrit.create({ data: { etablissementId: E.id, matricule: "ZZ-I1", firstName: "Awa", lastName: "Test", badge: "ZZBADGE" + randomBytes(4).toString("hex") } })
    const r = await db.reservation.create({ data: { etablissementId: E.id, inscritId: inscrit.id, date: dateDb(CIBLE), service: "LUNCH", statut: "BOOKED" } })
    await aller(chef)
    const l = ligne(chef)
    verifier((await attr(l, "data-reserves")) === 1, "une réservation")
    verifier((await attr(l, "data-prevu")) === 42, "prévu 42 (0,6 × 0,9 + 0,4 × 103)")
    await db.reservation.delete({ where: { id: r.id } })
    await aller(chef)
    verifier((await attr(ligne(chef), "data-prevu")) === 103, "retour à 103 sans réservation")
  })

  await etape("Calendrier : libellé trop court refusé, événement +20 % (prévu 124), suppression", async () => {
    await aller(chef)
    const f = chef.locator('[data-testid="form-evenement"]:visible')
    await f.locator("#ev-type").selectOption("EVENEMENT")
    await f.locator("#ev-debut").fill(CIBLE)
    await f.locator("#ev-impact").fill("20")
    await f.locator("#ev-libelle").fill("A")
    await f.getByRole("button", { name: "Ajouter" }).click()
    await texte(chef, "Donnez un libellé").waitFor()
    await f.locator("#ev-type").selectOption("EVENEMENT")
    await f.locator("#ev-debut").fill(CIBLE)
    await f.locator("#ev-impact").fill("20")
    await f.locator("#ev-libelle").fill("ZZ Fête")
    await f.getByRole("button", { name: "Ajouter" }).click()
    await texte(chef, "Événement ajouté").waitFor()
    await attendre(async () => (await db.evenementCantine.count({ where: { etablissementId: E.id, libelle: "ZZ Fête" } })) === 1, "événement en base")
    await aller(chef)
    verifier((await attr(ligne(chef), "data-prevu")) === 124, "prévu 124 (+20 %)")
    verifier((await attr(ligne(chef), "data-bas")) === 93 && (await attr(ligne(chef), "data-haut")) === 155, "intervalle 93 à 155")
    await chef.locator('tr[data-evenement][data-libelle="ZZ Fête"]:visible').getByRole("button", { name: "Supprimer" }).click()
    await attendre(async () => (await db.evenementCantine.count({ where: { etablissementId: E.id, libelle: "ZZ Fête" } })) === 0, "événement supprimé")
    await aller(chef)
    verifier((await attr(ligne(chef), "data-prevu")) === 103, "retour à 103")
  })

  await etape("Plan de production : quantité invalide refusée, plan fixé (120) puis retiré", async () => {
    await aller(chef)
    const champ = chef.locator("#pl-" + CIBLE + "-LUNCH:visible")
    verifier((await champ.inputValue()) === "109", "valeur proposée : 109 (103 + 5 %)")
    const ok = ligne(chef).getByRole("button", { name: "OK", exact: true })
    await ligne(chef).locator("form").evaluate((f) => { f.noValidate = true })
    await champ.fill("-5")
    await ok.click()
    await texte(chef, "Quantité invalide").waitFor()
    await champ.fill("120")
    await ok.click()
    await attendre(async () => (await db.planProduction.findFirst({ where: { etablissementId: E.id, date: dateDb(CIBLE), service: "LUNCH" } }))?.aProduire === 120, "plan enregistré")
    const plan = await db.planProduction.findFirst({ where: { etablissementId: E.id, date: dateDb(CIBLE), service: "LUNCH" } })
    verifier(plan.prevus === 103, "la prévision est figée avec le plan (103)")
    await aller(chef)
    verifier((await attr(rizCommande(chef), "data-besoin")) === 60 && (await attr(rizCommande(chef), "data-manque")) === 50, "avec 120 repas : besoin 60, à commander 50")
    verifier((await kpi(chef, "kpi-planifies")) === "1", "un créneau planifié")
    await aller(chef)
    const champ2 = chef.locator("#pl-" + CIBLE + "-LUNCH:visible")
    await champ2.fill("")
    await ligne(chef).getByRole("button", { name: "OK", exact: true }).click()
    await attendre(async () => (await db.planProduction.count({ where: { etablissementId: E.id, date: dateDb(CIBLE) } })) === 0, "plan retiré")
  })

  await etape("Commande : besoins, stock de sécurité, commande en cours et bon généré par les achats", async () => {
    await aller(achat)
    verifier((await attr(rizCommande(achat), "data-besoin")) === 54.5 && (await attr(rizCommande(achat), "data-manque")) === 44.5, "riz : besoin 54,5 (109 × 0,5), à commander 44,5")
    const o = achat.locator('tr[data-ingredient="ZZ Oignon"]:visible')
    verifier((await attr(o, "data-besoin")) === 21.8 && (await attr(o, "data-manque")) === 0, "oignon couvert par le stock")
    verifier(chiffres(await achat.locator('[data-testid="commande-total"]:visible').innerText()) === 44500, "coût à commander 44 500")
    await db.bonCommande.create({ data: { etablissementId: E.id, fournisseurId: fournisseur.id, numero: 1, statut: "SENT", lignes: { create: [{ ingredientId: riz.id, quantite: 10, prix: 1000 }] } } })
    await aller(achat)
    verifier((await attr(rizCommande(achat), "data-manque")) === 34.5, "commande en cours déduite : 34,5")
    const f = achat.locator('[data-testid="form-bon"]:visible')
    await f.getByRole("button", { name: "Générer le bon de commande" }).click()
    await texte(achat, "Choisissez un fournisseur").waitFor()
    await f.locator("#bo-fournisseur").selectOption(fournisseur.id)
    await f.getByRole("button", { name: "Générer le bon de commande" }).click()
    await achat.waitForURL((u) => /^\/achats\/.+/.test(u.pathname), { timeout: 30000 })
    const bon = await db.bonCommande.findFirst({ where: { etablissementId: E.id, statut: "DRAFT" }, include: { lignes: true } })
    verifier(!!bon && bon.lignes.length === 1, "un bon brouillon avec une seule ligne (l'oignon n'est pas commandé)")
    verifier(bon.lignes[0].ingredientId === riz.id && Number(bon.lignes[0].quantite) === 34.5 && Number(bon.lignes[0].prix) === 1000, "ligne riz : 34,5 à 1000")
    verifier((bon.note ?? "").startsWith("Prévision"), "note du bon")
  })

  await etape("Gaspillage : plat obligatoire, coût figé à la saisie, classement, surplus et écart de prévision", async () => {
    await aller(chef)
    const f = chef.locator('[data-testid="form-gaspillage"]:visible')
    await f.locator("#ga-portions").fill("5")
    await f.getByRole("button", { name: "Enregistrer" }).click()
    await texte(chef, "Choisissez un plat").waitFor()
    await f.locator("#ga-plat").selectOption(platA.id)
    await f.locator("#ga-portions").fill("10")
    await f.locator("#ga-note").fill("ZZ restes")
    await f.getByRole("button", { name: "Enregistrer" }).click()
    await texte(chef, "Gaspillage enregistré").waitFor()
    await attendre(async () => (await db.gaspillage.count({ where: { etablissementId: E.id } })) === 1, "première saisie")
    await f.locator("#ga-plat").selectOption(platB.id)
    await f.locator("#ga-portions").fill("4")
    await f.locator("#ga-type").selectOption("PREPARE_EN_TROP")
    await f.getByRole("button", { name: "Enregistrer" }).click()
    await attendre(async () => (await db.gaspillage.count({ where: { etablissementId: E.id } })) === 2, "seconde saisie")
    await db.ingredient.update({ where: { id: riz.id }, data: { unitCost: 2000 } })
    await aller(chef)
    const a = chef.locator('tr[data-gaspillage][data-plat="ZZ Plat Riz"]:visible')
    verifier((await attr(a, "data-cout")) === 5000 && (await attr(a, "data-portions")) === 10, "10 portions × 500 = 5 000, coût figé malgré la hausse du prix")
    verifier(chiffres(await chef.locator('[data-testid="gaspillage-cout"]:visible').innerText()) === 5400, "coût total 5 400")
    verifier(chiffres(await chef.locator('[data-testid="gaspillage-portions"]:visible').innerText()) === 14, "14 portions")
    const premier = chef.locator("tr[data-plat-gaspille]:visible").first()
    verifier((await premier.getAttribute("data-plat-gaspille")) === "ZZ Plat Riz", "le plat le plus coûteux est en tête")
    verifier((await kpi(chef, "surplus-repas")) === "30", "surplus 30 repas (120 produits, 90 servis)")
    verifier((await kpi(chef, "ecart-prevision")).startsWith("11"), "écart de prévision 11 %")
    verifier((await chef.getByText("ZZ Autre Plat").count()) === 0, "gaspillage d'un autre établissement invisible")
    await chef.locator('tr[data-gaspillage][data-plat="ZZ Plat Oignon"]:visible').getByRole("button", { name: "Supprimer" }).click()
    await attendre(async () => (await db.gaspillage.count({ where: { etablissementId: E.id } })) === 1, "saisie supprimée")
  })

  await etape("Audit et isolation entre établissements", async () => {
    for (const [action, email] of [["PRODUCTION_PLAN", CHEF], ["EVENEMENT_CREE", CHEF], ["EVENEMENT_SUPPRIME", CHEF], ["GASPILLAGE_SAISI", CHEF], ["GASPILLAGE_SUPPRIME", CHEF], ["BON_GENERE_PREVISION", ACHAT]]) {
      verifier(!!(await db.auditLog.findFirst({ where: { action, userEmail: email } })), "audit " + action)
    }
    verifier((await db.gaspillage.count({ where: { etablissementId: E2.id } })) === 1, "gaspillage de l'autre établissement intact")
    verifier((await db.evenementCantine.count({ where: { etablissementId: E2.id } })) === 1, "événement de l'autre établissement intact")
    verifier((await db.planProduction.count({ where: { etablissementId: E2.id } })) === 0, "aucun plan dans l'autre établissement")
  })

  await terminer(nettoyer, "PRODUCTION", 0)
}

principal().catch(async (e) => {
  console.error("Echec : " + (e && e.message ? e.message : e))
  await terminer(nettoyer, "PRODUCTION", 1)
})