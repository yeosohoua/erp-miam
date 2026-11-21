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

const PORT = 3128
const BASE = "http://localhost:" + PORT
const mdpGest = secret()
const mdpAchat = secret()
const mdpMag = secret()
const mdpRh = secret()
const GEST = "test-re-gest@miam.test"
const ACHAT = "test-re-achat@miam.test"
const MAG = "test-re-mag@miam.test"
const RH = "test-re-rh@miam.test"
const EMAILS = [GEST, ACHAT, MAG, RH]
const CRON = secret() + secret()

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: { in: [...EMAILS, "planificateur"] }, entity: { in: ["Reappro", "Etablissement"] }, details: { not: "" } } }).catch(() => {})
  await db.auditLog.deleteMany({ where: { userEmail: { in: EMAILS } } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-RE", name: "ZZ Cantine Reappro", type: "SCHOOL", prepaye: true } })
  const E2 = await db.etablissement.create({ data: { code: "ZZ-RF", name: "ZZ Autre Reappro", type: "SCHOOL", prepaye: true } })
  const creerUser = (email, name, role, mdp) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  await creerUser(GEST, "Test Re Gest", "MANAGER", mdpGest)
  await creerUser(ACHAT, "Test Re Achat", "PURCHASER", mdpAchat)
  await creerUser(MAG, "Test Re Mag", "STOREKEEPER", mdpMag)
  await creerUser(RH, "Test Re Rh", "HR", mdpRh)

  const F = await db.fournisseur.create({ data: { etablissementId: E.id, name: "ZZ Grossiste" } })
  const F2 = await db.fournisseur.create({ data: { etablissementId: E2.id, name: "ZZ Autre Grossiste" } })
  const ing = (etab, name, cout, stock) => db.ingredient.create({ data: { etablissementId: etab.id, name, unit: "kg", unitCost: cout, stock } })
  const riz = await ing(E, "ZZ Riz", 800, 20)
  const huile = await ing(E, "ZZ Huile", 1500, 5)
  const sel = await ing(E, "ZZ Sel", 200, 50)
  const sucre = await ing(E, "ZZ Sucre", 500, 0)
  const farine = await ing(E, "ZZ Farine", 600, 0)
  const rizAutre = await ing(E2, "ZZ Riz Autre", 800, 0)
  await db.bonCommande.create({ data: { etablissementId: E.id, fournisseurId: F.id, numero: 1, statut: "SENT", envoyeLe: new Date(), lignes: { create: [{ ingredientId: huile.id, quantite: 10, recue: 4, prix: 1500 }] } } })
  await db.regleReappro.create({ data: { etablissementId: E.id, ingredientId: huile.id, cible: 30, fournisseurId: F.id, delaiJours: 2 } })
  await db.regleReappro.create({ data: { etablissementId: E.id, ingredientId: sel.id, cible: 40, fournisseurId: F.id } })
  await db.regleReappro.create({ data: { etablissementId: E.id, ingredientId: sucre.id, cible: 10 } })
  await db.regleReappro.create({ data: { etablissementId: E.id, ingredientId: farine.id, cible: 20, fournisseurId: F.id, actif: false } })
  await db.regleReappro.create({ data: { etablissementId: E2.id, ingredientId: rizAutre.id, cible: 50, fournisseurId: F2.id } })

  process.env.CRON_SECRET = CRON
  await demarrer(BASE, PORT)
  const gest = await connecter(BASE, GEST, mdpGest)
  const achat = await connecter(BASE, ACHAT, mdpAchat)
  const mag = await connecter(BASE, MAG, mdpMag)
  const rh = await connecter(BASE, RH, mdpRh)
  const texte = (p, t) => p.getByText(t).filter({ visible: true }).first()
  const aller = async (p, chemin, testid) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
  }
  const valeurKpi = (p, nom) => p.locator('[data-kpi="' + nom + '"] p').nth(1).innerText()
  const regle = async (p, o) => {
    const f = p.locator('[data-testid="form-regle"]:visible')
    await f.locator("#rg-ingredient").selectOption(o.ing ?? "")
    await f.locator("#rg-cible").fill(o.cible ?? "")
    await f.locator("#rg-fournisseur").selectOption(o.fournisseur ?? "")
    await f.locator("#rg-delai").fill(o.delai ?? "2")
    await f.getByRole("button", { name: "Enregistrer la règle" }).click()
  }
  const cellules = async (p, nom) => (await p.locator('[data-proposition="' + nom + '"] td').allInnerTexts()).map((t) => t.trim())

  await etape("Accès : achat, direction et magasin voient la page ; la RH n'a ni la page ni l'entrée de menu", async () => {
    for (const p of [gest, achat, mag]) {
      await aller(p, "/reappro", "reappro-page")
      verifier((await p.locator('[data-testid="menu-principal"] a[href="/reappro"]').count()) >= 1, "entrée de menu Réapprovisionnement")
    }
    await aller(rh, "/reappro", "acces-refuse")
    verifier((await rh.locator('[data-testid="reappro-page"]').count()) === 0, "la RH n'accède pas à la page")
    verifier((await rh.locator('[data-testid="menu-principal"] a[href="/reappro"]').count()) === 0, "pas d'entrée de menu pour la RH")
  })

  await etape("Règles : saisies invalides refusées, isolation des fournisseurs et ingrédients, remplacement sans doublon", async () => {
    await aller(achat, "/reappro?vue=regles", "table-regles")
    verifier((await achat.locator('#rg-ingredient option[value="' + rizAutre.id + '"]').count()) === 0, "l'ingrédient d'un autre établissement n'est pas proposé")
    verifier((await achat.locator('#rg-fournisseur option[value="' + F2.id + '"]').count()) === 0, "le fournisseur d'un autre établissement n'est pas proposé")
    await regle(achat, { ing: "", cible: "10" })
    await texte(achat, "Choisissez un ingrédient").waitFor()
    await regle(achat, { ing: riz.id, cible: "0" })
    await texte(achat, "Cible invalide").waitFor()
    await regle(achat, { ing: riz.id, cible: "100", delai: "99" })
    await texte(achat, "Délai invalide").waitFor()
    verifier((await db.regleReappro.count({ where: { ingredientId: riz.id } })) === 0, "rien n'est enregistré après les refus")
    await regle(achat, { ing: riz.id, cible: "60", fournisseur: F.id, delai: "3" })
    await texte(achat, "Règle enregistrée pour ZZ Riz.").waitFor()
    await regle(achat, { ing: riz.id, cible: "100", fournisseur: F.id, delai: "3" })
    await attendre(async () => Number((await db.regleReappro.findFirst({ where: { ingredientId: riz.id } }))?.cible) === 100, "règle remplacée par une cible de 100")
    verifier((await db.regleReappro.count({ where: { ingredientId: riz.id } })) === 1, "pas de doublon de règle")
    verifier((await achat.locator('[data-regle="ZZ Farine"]').innerText()).includes("Désactivée"), "règle désactivée affichée")
    verifier((await achat.locator('[data-regle="ZZ Riz Autre"]').count()) === 0, "règle d'un autre établissement invisible")
  })

  await etape("Propositions : cible moins stock moins commandes en cours, fournisseurs, règles inactives ignorées", async () => {
    await aller(gest, "/reappro?vue=propositions", "table-propositions")
    const riz1 = await cellules(gest, "ZZ Riz")
    verifier(riz1[4].startsWith("80 kg") && riz1[5] === "ZZ Grossiste", "riz : 80 kg chez ZZ Grossiste, obtenu " + riz1.join(" | "))
    const huile1 = await cellules(gest, "ZZ Huile")
    verifier(huile1[2].startsWith("6 kg") && huile1[4].startsWith("19 kg"), "huile : 6 kg en commande et 19 kg à commander, obtenu " + huile1.join(" | "))
    const sucre1 = await cellules(gest, "ZZ Sucre")
    verifier(sucre1[4].startsWith("10 kg") && sucre1[5] === "Sans fournisseur", "sucre : 10 kg sans fournisseur, obtenu " + sucre1.join(" | "))
    for (const nom of ["ZZ Sel", "ZZ Farine", "ZZ Riz Autre"]) verifier((await gest.locator('[data-proposition="' + nom + '"]').count()) === 0, nom + " n'est pas proposé")
    verifier((await valeurKpi(gest, "prop-lignes")) === "3", "trois lignes")
    verifier((await valeurKpi(gest, "prop-fournisseurs")) === "1", "un fournisseur")
    verifier((await valeurKpi(gest, "prop-sans-fournisseur")) === "1", "un ingrédient sans fournisseur")
    verifier((await gest.locator('[data-testid="form-generer"]').count()) === 1, "la direction peut générer des bons (écriture réappro)")
  })

  await etape("Génération : un bon brouillon par fournisseur, relance sans doublon, aucun envoi automatique", async () => {
    await aller(achat, "/reappro?vue=propositions", "table-propositions")
    await achat.getByRole("button", { name: "Générer les bons en brouillon" }).click()
    await texte(achat, "1 bon(s) brouillon créé(s) ou complété(s) pour 2 ingrédient(s).").waitFor()
    const brouillons = await db.bonCommande.findMany({ where: { etablissementId: E.id, statut: "DRAFT" }, include: { lignes: true } })
    verifier(brouillons.length === 1, "un seul bon brouillon")
    const bon = brouillons[0]
    verifier(bon.fournisseurId === F.id && bon.numero === null && bon.note.startsWith("Réapprovisionnement automatique"), "bon brouillon sans numéro, chez ZZ Grossiste")
    const l = (id) => bon.lignes.find((x) => x.ingredientId === id)
    verifier(Number(l(riz.id).quantite) === 80 && Number(l(riz.id).prix) === 800, "riz : 80 kg au prix de l'ingrédient")
    verifier(Number(l(huile.id).quantite) === 19, "huile : 19 kg")
    verifier(bon.lignes.length === 2, "le sucre sans fournisseur n'est pas commandé")
    verifier((await db.bonCommande.count({ where: { etablissementId: E2.id } })) === 0, "aucun bon dans l'autre établissement")
    verifier((await db.bonCommande.count({ where: { etablissementId: E.id, statut: "SENT" } })) === 1, "aucun bon n'est envoyé automatiquement")
    await achat.getByRole("button", { name: "Générer les bons en brouillon" }).click()
    await texte(achat, "Aucun bon à créer").waitFor()
    verifier((await db.bonCommande.count({ where: { etablissementId: E.id } })) === 2, "la relance ne crée rien")
    verifier((await db.bonCommandeLigne.count({ where: { bonId: bon.id } })) === 2, "les lignes ne sont pas dupliquées")
  })

  await etape("Tâche planifiée : secret obligatoire, bon brouillon complété, rôles en lecture seule, audit", async () => {
    verifier((await fetch(BASE + "/api/reappro/traiter", { method: "POST" })).status === 401, "sans secret : 401")
    verifier((await fetch(BASE + "/api/reappro/traiter", { method: "POST", headers: { "x-cron-secret": CRON + "x" } })).status === 401, "mauvais secret : 401")
    verifier((await fetch(BASE + "/api/reappro/traiter", { headers: { "x-cron-secret": CRON } })).status === 405, "GET refusé")
    await db.ingredient.update({ where: { id: riz.id }, data: { stock: 0 } })
    const r = await fetch(BASE + "/api/reappro/traiter?etablissement=" + E.id, { method: "POST", headers: { "x-cron-secret": CRON } })
    verifier(r.status === 200, "appel planifié accepté, statut " + r.status)
    const corps = await r.json()
    verifier(corps.etablissements === 1 && corps.bons === 1 && corps.lignes === 1 && corps.sansFournisseur === 1, "résultat de la tâche : " + JSON.stringify(corps))
    const brouillons = await db.bonCommande.findMany({ where: { etablissementId: E.id, statut: "DRAFT" }, include: { lignes: true } })
    verifier(brouillons.length === 1, "le brouillon existant est complété, pas dupliqué")
    verifier(Number(brouillons[0].lignes.find((x) => x.ingredientId === riz.id).quantite) === 100, "riz : 80 + 20 = 100 kg")
    const apres = await fetch(BASE + "/api/reappro/traiter?etablissement=" + E.id, { method: "POST", headers: { "x-cron-secret": CRON } })
    const corps2 = await apres.json()
    verifier(corps2.bons === 0 && corps2.lignes === 0, "seconde exécution : rien de plus, " + JSON.stringify(corps2))

    await aller(mag, "/reappro?vue=regles", "table-regles")
    verifier((await mag.locator('[data-testid="form-regle"]').count()) === 0, "le magasin ne définit pas de règle")
    verifier((await mag.getByRole("button", { name: "Supprimer" }).count()) === 0, "le magasin ne supprime rien")
    await aller(mag, "/reappro?vue=propositions", "table-propositions")
    verifier((await mag.locator('[data-testid="form-generer"]').count()) === 0, "le magasin ne génère pas de bons")
    const anonyme = await fetch(BASE + "/reappro", { redirect: "manual" })
    verifier([301, 302, 303, 307, 308].includes(anonyme.status), "accès anonyme redirigé, statut " + anonyme.status)
    const compte = (email, action) => db.auditLog.count({ where: { userEmail: email, action } })
    verifier((await compte(ACHAT, "REGLE_ENREGISTREE")) >= 2, "audit des règles")
    verifier((await compte(ACHAT, "REAPPRO_BONS")) >= 1, "audit de la génération")
    verifier((await compte("planificateur", "REAPPRO_AUTO")) >= 1, "audit de la tâche planifiée")
  })
}

principal()
  .then(() => terminer(nettoyer, "REAPPRO", 0))
  .catch((e) => {
    console.log("ERREUR : " + e.message)
    return terminer(nettoyer, "REAPPRO", 1)
  })