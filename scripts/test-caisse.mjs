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

const PORT = 3119
const BASE = "http://localhost:" + PORT
const mdpGest = secret()
const mdpCaisse = secret()
const mdpChef = secret()
const mdpCompta = secret()
const GEST = "test-ca-gest@miam.test"
const CAISSE = "test-ca-caisse@miam.test"
const CHEF = "test-ca-chef@miam.test"
const COMPTA = "test-ca-compta@miam.test"
const EMAILS = [GEST, CAISSE, CHEF, COMPTA]
const BADGE = "ZZBADGE-C1"
const BADGE_X = "ZZBADGE-X"

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: { in: EMAILS } } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-CA", name: "ZZ Cantine Caisse", type: "SCHOOL" } })
  const E2 = await db.etablissement.create({ data: { code: "ZZ-CB", name: "ZZ Autre Caisse", type: "SCHOOL" } })
  const creerUser = (email, name, role, mdp) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  await creerUser(GEST, "Test Ca Gest", "MANAGER", mdpGest)
  await creerUser(CAISSE, "Test Ca Caisse", "CASHIER", mdpCaisse)
  await creerUser(CHEF, "Test Ca Chef", "CHEF", mdpChef)
  await creerUser(COMPTA, "Test Ca Compta", "ACCOUNTANT", mdpCompta)
  const eleve = await db.inscrit.create({ data: { etablissementId: E.id, matricule: "ZZ-C1", firstName: "Awa", lastName: "Caisse", badge: BADGE, solde: 5000 } })
  const eleveX = await db.inscrit.create({ data: { etablissementId: E2.id, matricule: "ZZ-X1", firstName: "Autre", lastName: "Etab", badge: BADGE_X, solde: 10000 } })

  process.env.CRON_SECRET = secret() + secret()
  await demarrer(BASE, PORT)
  const gest = await connecter(BASE, GEST, mdpGest)
  const caisse = await connecter(BASE, CAISSE, mdpCaisse)
  const texte = (p, t) => p.getByText(t).filter({ visible: true }).first()
  const aller = async (p, chemin = "/caisse", testid = "caisse-page") => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
  }
  const attr = async (loc, nom) => Number(await loc.getAttribute(nom))
  const ajouter = async (p, nom, n = 1) => {
    for (let i = 0; i < n; i++) await p.locator('button[data-article="' + nom + '"]:visible').click()
  }
  const mode = (p, m) => p.locator('button[data-mode="' + m + '"]:visible').click()
  const encaisser = (p) => p.getByRole("button", { name: "Encaisser" }).click()
  const resultat = (p) => p.locator('[data-testid="caisse-resultat"]:visible')
  const erreur = (p) => p.locator('[data-testid="caisse-erreur"]:visible')
  const vente = (p, n) => p.locator('tr[data-vente][data-numero="' + n + '"]:visible')
  const ligneArticle = (p, nom) => p.locator('tr[data-article-ligne="' + nom + '"]:visible')
  const desequilibres = () => db.$queryRaw`SELECT e.id FROM ecritures_compta e JOIN ecriture_lignes l ON l."ecritureId" = e.id WHERE e."etablissementId" = ${E.id} GROUP BY e.id HAVING SUM(l.debit) <> SUM(l.credit)`
  const solde = async () => (await db.inscrit.findUnique({ where: { id: eleve.id } })).solde

  await etape("Accès : caissier et gestionnaire, pas le chef ; gestion des articles réservée au gestionnaire", async () => {
    await aller(caisse)
    verifier((await caisse.locator('[data-testid="form-article"]').count()) === 0 && (await caisse.locator('[data-testid="articles"]').count()) === 0, "le caissier ne gère pas les articles")
    verifier((await caisse.locator('[data-testid="menu-principal"] a[href="/caisse"]').count()) >= 1, "le caissier a l'entrée Caisse")
    const chef = await connecter(BASE, CHEF, mdpChef)
    await aller(chef, "/caisse", "acces-refuse")
    verifier((await chef.locator('[data-testid="caisse-page"]').count()) === 0, "le chef n'accède pas à la caisse")
    await aller(gest)
    verifier((await gest.locator('[data-testid="form-article"]:visible').count()) === 1, "le gestionnaire voit le formulaire d'article")
  })

  await etape("Articles : prix invalide et doublon refusés, création, modification du prix, désactivation", async () => {
    await aller(gest)
    const f = gest.locator('[data-testid="form-article"]:visible')
    const saisir = async (nom, prix, cat) => {
      await f.locator("#ar-nom").fill(nom)
      await f.locator("#ar-prix").fill(prix)
      await f.locator("#ar-categorie").fill(cat)
      await f.getByRole("button", { name: "Ajouter l'article" }).click()
    }
    await f.evaluate((el) => { el.noValidate = true })
    await saisir("ZZ Jus", "0", "Boissons")
    await texte(gest, "Prix invalide").waitFor()
    await saisir("ZZ Jus", "500", "Boissons")
    await texte(gest, "ZZ Jus ajouté").waitFor()
    await saisir("ZZ Sandwich", "1500", "Snacks")
    await texte(gest, "ZZ Sandwich ajouté").waitFor()
    await sleep(600)
    await attendre(async () => (await db.articleCarte.count({ where: { etablissementId: E.id } })) === 2, "deux articles")
    await saisir("ZZ Jus", "700", "Boissons")
    await texte(gest, "Un article porte déjà ce nom").waitFor()
    await saisir("ZZ Gâteau", "1000", "Snacks")
    await attendre(async () => (await db.articleCarte.count({ where: { etablissementId: E.id } })) === 3, "trois articles")
    await aller(gest)
    const jus = await db.articleCarte.findFirst({ where: { etablissementId: E.id, nom: "ZZ Jus" } })
    await gest.locator("#pr-" + jus.id).fill("600")
    await ligneArticle(gest, "ZZ Jus").getByRole("button", { name: "OK", exact: true }).click()
    await attendre(async () => (await db.articleCarte.findUnique({ where: { id: jus.id } })).prix === 600, "prix 600")
    await aller(gest)
    await gest.locator("#pr-" + jus.id).fill("500")
    await ligneArticle(gest, "ZZ Jus").getByRole("button", { name: "OK", exact: true }).click()
    await attendre(async () => (await db.articleCarte.findUnique({ where: { id: jus.id } })).prix === 500, "prix rétabli à 500")
    await aller(gest)
    await ligneArticle(gest, "ZZ Gâteau").getByRole("button", { name: "Désactiver" }).click()
    await attendre(async () => (await db.articleCarte.findFirst({ where: { etablissementId: E.id, nom: "ZZ Gâteau" } })).active === false, "article désactivé")
    await aller(caisse)
    verifier((await caisse.locator('button[data-article="ZZ Jus"]:visible').count()) === 1 && (await caisse.locator('button[data-article="ZZ Sandwich"]:visible').count()) === 1, "deux articles en vente")
    verifier((await caisse.locator('button[data-article="ZZ Gâteau"]').count()) === 0, "l'article désactivé n'est plus en caisse")
  })

  await etape("Vente sur compte prépayé : total, débit exact, ticket n°1, transaction liée", async () => {
    await aller(caisse)
    await ajouter(caisse, "ZZ Jus", 2)
    await ajouter(caisse, "ZZ Sandwich", 1)
    verifier((await attr(caisse.locator('[data-testid="panier-total"]:visible'), "data-valeur")) === 2500, "total 2 × 500 + 1 500 = 2 500")
    await caisse.locator("#ca-identifiant:visible").fill(BADGE)
    await caisse.locator("#ca-identifiant:visible").press("Enter")
    await resultat(caisse).waitFor()
    const r = resultat(caisse)
    verifier((await attr(r, "data-numero")) === 1 && (await attr(r, "data-total")) === 2500 && (await attr(r, "data-solde")) === 2500, "ticket 1, 2 500 encaissés, solde restant 2 500")
    verifier((await solde()) === 2500, "solde en base 2 500")
    const v = await db.venteComptoir.findFirst({ where: { etablissementId: E.id, numero: 1 }, include: { lignes: true } })
    verifier(v.statut === "PAYEE" && v.methode === null && v.inscritId === eleve.id && v.total === 2500 && v.lignes.length === 2, "vente enregistrée")
    const tx = await db.transaction.findFirst({ where: { etablissementId: E.id, reference: "CAISSE-1" } })
    verifier(tx && tx.type === "DEBIT" && tx.montant === -2500 && tx.inscritId === eleve.id, "transaction DEBIT -2 500")
    verifier((await attr(caisse.locator('[data-testid="panier-total"]:visible'), "data-valeur")) === 0, "panier vidé après la vente")
  })

  await etape("Refus : solde insuffisant, badge inconnu, badge d'un autre établissement, badge absent", async () => {
    await ajouter(caisse, "ZZ Sandwich", 2)
    await caisse.locator("#ca-identifiant:visible").fill(BADGE)
    await encaisser(caisse)
    await texte(caisse, "Solde insuffisant").waitFor()
    verifier((await solde()) === 2500, "solde inchangé")
    await caisse.locator("#ca-identifiant:visible").fill("ZZ-INCONNU")
    await encaisser(caisse)
    await texte(caisse, "Inscrit introuvable").waitFor()
    await caisse.locator("#ca-identifiant:visible").fill(BADGE_X)
    await encaisser(caisse)
    await attendre(async () => (await erreur(caisse).innerText().catch(() => "")).includes("Inscrit introuvable"), "badge d'un autre établissement refusé")
    verifier((await db.inscrit.findUnique({ where: { id: eleveX.id } })).solde === 10000, "solde de l'autre établissement intact")
    await caisse.locator("#ca-identifiant:visible").fill("")
    await encaisser(caisse)
    await texte(caisse, "Scannez le badge").waitFor()
    verifier((await db.venteComptoir.count({ where: { etablissementId: E.id } })) === 1, "aucune vente créée par les refus")
    await caisse.getByRole("button", { name: "Supprimer ZZ Sandwich" }).click()
  })

  await etape("Ventes en espèces (visiteur) et Mobile Money : compte non touché, numérotation continue", async () => {
    await mode(caisse, "CASH")
    await ajouter(caisse, "ZZ Sandwich", 2)
    await caisse.locator("#ca-visiteur:visible").fill("ZZ Visiteur")
    await encaisser(caisse)
    await resultat(caisse).waitFor()
    verifier((await attr(resultat(caisse), "data-numero")) === 2 && (await attr(resultat(caisse), "data-total")) === 3000, "ticket 2, 3 000 en espèces")
    await mode(caisse, "MTN")
    await ajouter(caisse, "ZZ Jus", 3)
    await encaisser(caisse)
    await attendre(async () => (await db.venteComptoir.count({ where: { etablissementId: E.id } })) === 3, "troisième vente")
    const v2 = await db.venteComptoir.findFirst({ where: { etablissementId: E.id, numero: 2 } })
    const v3 = await db.venteComptoir.findFirst({ where: { etablissementId: E.id, numero: 3 } })
    verifier(v2.methode === "CASH" && v2.visiteur === "ZZ Visiteur" && v2.inscritId === null, "vente 2 : espèces, visiteur")
    verifier(v3.methode === "MTN" && v3.total === 1500, "vente 3 : MTN, 1 500")
    verifier((await solde()) === 2500, "le compte prépayé n'a pas bougé")
    await aller(caisse)
    verifier((await caisse.locator('[data-testid="kpi-ventes-jour"]').innerText()).trim() === "3" && (await attr(caisse.locator('[data-testid="kpi-ca-jour"]'), "data-valeur")) === 7000, "3 ventes, 7 000 encaissés")
  })

  await etape("Annulation : réservée au gestionnaire, compte remboursé, vente en espèces annulée", async () => {
    await aller(caisse)
    verifier((await caisse.getByRole("button", { name: "Annuler" }).count()) === 0, "le caissier n'annule pas")
    await aller(gest)
    await vente(gest, 1).getByRole("button", { name: "Annuler" }).click()
    await attendre(async () => (await solde()) === 5000, "compte remboursé")
    const remb = await db.transaction.findFirst({ where: { etablissementId: E.id, reference: "CAISSE-1-ANNUL" } })
    verifier(remb && remb.type === "REFUND" && remb.montant === 2500, "transaction REFUND +2 500")
    await aller(gest)
    await vente(gest, 2).getByRole("button", { name: "Annuler" }).click()
    await attendre(async () => (await db.venteComptoir.findFirst({ where: { etablissementId: E.id, numero: 2 } })).statut === "ANNULEE", "vente 2 annulée")
    await aller(gest)
    verifier((await vente(gest, 1).getAttribute("data-statut")) === "ANNULEE" && (await vente(gest, 3).getAttribute("data-statut")) === "PAYEE", "statuts affichés")
    verifier((await vente(gest, 1).getByRole("button", { name: "Annuler" }).count()) === 0, "pas de seconde annulation")
    verifier((await gest.locator('[data-testid="kpi-ventes-jour"]').innerText()).trim() === "1" && (await attr(gest.locator('[data-testid="kpi-ca-jour"]'), "data-valeur")) === 1500, "1 vente payée, 1 500 encaissés")
    const v1 = await db.venteComptoir.findFirst({ where: { etablissementId: E.id, numero: 1 } })
    verifier(v1.annuleePar === GEST && v1.annuleeLe !== null, "annulation tracée")
  })

  await etape("Comptabilité : 4 écritures équilibrées (repas, espèces, annulation, Mobile Money), soldes exacts, rejouable", async () => {
    await aller(caisse)
    await ajouter(caisse, "ZZ Jus", 2)
    await caisse.locator("#ca-identifiant:visible").fill(BADGE)
    await mode(caisse, "COMPTE")
    await caisse.locator("#ca-identifiant:visible").fill(BADGE)
    await encaisser(caisse)
    await resultat(caisse).waitFor()
    verifier((await attr(resultat(caisse), "data-numero")) === 4 && (await solde()) === 4000, "ticket 4, solde 4 000")
    const cpt = await connecter(BASE, COMPTA, mdpCompta)
    await aller(cpt, "/comptabilite?vue=journal&periode=tout", "compta-page")
    await cpt.getByRole("button", { name: "Comptabiliser maintenant" }).click()
    await texte(cpt, "4 écriture(s) comptabilisée(s)").waitFor()
    await attendre(async () => (await db.ecritureCompta.count({ where: { etablissementId: E.id } })) === 4, "quatre écritures")
    verifier((await desequilibres()).length === 0, "écritures équilibrées")
    for (const src of ["REPAS", "VENTE", "VENTE_ANNUL"]) {
      verifier((await db.ecritureCompta.count({ where: { etablissementId: E.id, sourceType: src } })) >= 1, "source " + src)
    }
    await aller(cpt, "/comptabilite?vue=balance&periode=tout", "compta-page")
    const attendus = { "706": [3000, 5500], "571": [3000, 3000], "5212": [1500, 0], "4191": [1000, 0] }
    for (const [compte, [d, c]] of Object.entries(attendus)) {
      const l = cpt.locator('tr[data-compte="' + compte + '"]:visible')
      const dd = await attr(l, "data-debit")
      const cc = await attr(l, "data-credit")
      verifier(dd === d && cc === c, "compte " + compte + " : " + dd + "/" + cc + " au lieu de " + d + "/" + c)
    }
    await aller(cpt, "/comptabilite?vue=journal&periode=tout", "compta-page")
    await cpt.getByRole("button", { name: "Comptabiliser maintenant" }).click()
    await texte(cpt, "Rien à comptabiliser").waitFor()
    verifier((await db.ecritureCompta.count({ where: { etablissementId: E.id } })) === 4, "toujours quatre écritures")
  })

  await etape("Concurrence : deux caissiers encaissent en même temps un solde qui ne couvre qu'une vente", async () => {
    await db.inscrit.update({ where: { id: eleve.id }, data: { solde: 1500 } })
    const caisse2 = await connecter(BASE, CAISSE, mdpCaisse)
    for (const p of [caisse, caisse2]) {
      await aller(p)
      await ajouter(p, "ZZ Jus", 3)
      await p.locator("#ca-identifiant:visible").fill(BADGE)
    }
    await Promise.all([encaisser(caisse), encaisser(caisse2)])
    for (const p of [caisse, caisse2]) await p.locator('[data-testid="caisse-resultat"], [data-testid="caisse-erreur"]').first().waitFor()
    const succes = [caisse, caisse2].filter(async () => true)
    let n = 0
    for (const p of [caisse, caisse2]) if ((await resultat(p).count()) === 1) n++
    verifier(n === 1, "exactement une vente réussie (obtenu " + n + ")")
    verifier((await solde()) === 0, "solde à 0, jamais négatif")
    verifier((await db.venteComptoir.count({ where: { etablissementId: E.id, numero: 5 } })) === 1 && (await db.venteComptoir.count({ where: { etablissementId: E.id } })) === 5, "une seule vente créée (n° 5)")
    void succes
  })

  await etape("Audit et isolation entre établissements", async () => {
    for (const [action, email] of [["VENTE_COMPTOIR", CAISSE], ["VENTE_ANNULEE", GEST], ["ARTICLE_CREE", GEST], ["ARTICLE_PRIX", GEST], ["ARTICLE_DESACTIVE", GEST]]) {
      verifier(!!(await db.auditLog.findFirst({ where: { action, userEmail: email } })), "audit " + action)
    }
    verifier((await db.venteComptoir.count({ where: { etablissementId: E2.id } })) === 0, "aucune vente dans l'autre établissement")
    verifier((await db.articleCarte.count({ where: { etablissementId: E2.id } })) === 0, "aucun article dans l'autre établissement")
    verifier((await db.ecritureCompta.count({ where: { etablissementId: E2.id } })) === 0, "aucune écriture dans l'autre établissement")
    verifier((await db.inscrit.findUnique({ where: { id: eleveX.id } })).solde === 10000, "solde de l'autre établissement intact")
  })

  await terminer(nettoyer, "CAISSE", 0)
}

principal().catch(async (e) => {
  console.error("Echec : " + (e && e.message ? e.message : e))
  await terminer(nettoyer, "CAISSE", 1)
})