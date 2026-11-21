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
const AUJ = new Date().toISOString().slice(0, 10)
const MOIS = AUJ.slice(0, 7)
const dateUtc = (iso) => new Date(iso + "T00:00:00.000Z")
const PREC = (() => {
  const n = new Date()
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)
})()
const jourPrec = (j) => PREC + "-" + String(j).padStart(2, "0")

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
  const p = await (await navigateur.newContext({ locale: "fr-FR", viewport: { width: 1440, height: 1600 } })).newPage()
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

const PORT = 3116
const BASE = "http://localhost:" + PORT
const mdpCompta = secret()
const mdpCaisse = secret()
const COMPTA = "test-cp-compta@miam.test"
const CAISSE = "test-cp-caisse@miam.test"
const EMAILS = [COMPTA, CAISSE]

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: { in: EMAILS } } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-CP", name: "ZZ Cantine CP", type: "SCHOOL", prepaye: true } })
  const E2 = await db.etablissement.create({ data: { code: "ZZ-CQ", name: "ZZ Autre CP", type: "SCHOOL" } })
  const creerUser = (email, name, role, mdp) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  await creerUser(COMPTA, "Test Cp Compta", "ACCOUNTANT", mdpCompta)
  await creerUser(CAISSE, "Test Cp Caisse", "CASHIER", mdpCaisse)

  const client = await db.client.create({ data: { etablissementId: E.id, name: "ZZ Client CP" } })
  const facture = (numero, total, statut, emisLe) =>
    db.facture.create({ data: { etablissementId: E.id, clientId: client.id, numero, periode: MOIS, statut, total, emisLe, echeance: dateUtc(AUJ), lignes: { create: [{ libelle: "Déjeuner", quantite: 1, prixUnitaire: total, montant: total }] } } })
  const F1 = await facture(1, 10000, "ISSUED", new Date())
  await facture(2, 3000, "CANCELLED", new Date())
  await db.reglement.create({ data: { etablissementId: E.id, factureId: F1.id, montant: 4000, methode: "CASH" } })
  await db.reglement.create({ data: { etablissementId: E.id, factureId: F1.id, montant: 1000, methode: "ORANGE", reference: "OM-ZZ-1234" } })

  const ins = await db.inscrit.create({ data: { etablissementId: E.id, matricule: "ZZP-A", firstName: "Alpha", lastName: "Cp", badge: "ZZP" + "1".padStart(13, "0"), solde: 0 } })
  const tx = (data) => db.transaction.create({ data: { etablissementId: E.id, inscritId: ins.id, ...data } })
  await tx({ type: "TOPUP", methode: "CASH", montant: 5000 })
  await tx({ type: "TOPUP", methode: "PAYSTACK", montant: 2000, reference: "PSK-ZZ-1" })
  await tx({ type: "ADJUST", montant: 300, note: "geste" })
  await tx({ type: "ADJUST", montant: -100, note: "correction" })
  for (let i = 0; i < 3; i++) await tx({ type: "DEBIT", montant: -500 })
  await tx({ type: "REFUND", montant: 500 })

  const four = await db.fournisseur.create({ data: { etablissementId: E.id, name: "ZZ Fournisseur" } })
  const ing = await db.ingredient.create({ data: { etablissementId: E.id, name: "ZZ Riz", unit: "kg" } })
  const bon = await db.bonCommande.create({ data: { etablissementId: E.id, fournisseurId: four.id, numero: 1, statut: "RECEIVED" } })
  const conso = await db.consommation.create({ data: { etablissementId: E.id, date: dateUtc(AUJ), service: "LUNCH", repas: 4 } })
  const mv = (data) => db.mouvementStock.create({ data: { etablissementId: E.id, ingredientId: ing.id, prix: 250, userEmail: COMPTA, ...data } })
  await mv({ type: "ENTREE", quantite: 10, bonId: bon.id, reference: "BC-00001" })
  await mv({ type: "SORTIE", quantite: -4, consommationId: conso.id })
  await mv({ type: "PERTE", quantite: -1 })
  await mv({ type: "INVENTAIRE", quantite: -2 })

  const client2 = await db.client.create({ data: { etablissementId: E2.id, name: "ZZ Client Autre" } })
  await db.facture.create({ data: { etablissementId: E2.id, clientId: client2.id, numero: 1, periode: MOIS, statut: "ISSUED", total: 777, emisLe: new Date(), echeance: dateUtc(AUJ) } })

  await demarrer(BASE, PORT)
  const page = await connecter(BASE, COMPTA, mdpCompta)
  const texteVisible = (p, t) => p.getByText(t).filter({ visible: true }).first()
  const aller = async (vue, extra = "") => {
    await page.goto(BASE + "/comptabilite?vue=" + vue + "&periode=tout" + extra, { waitUntil: "load" })
    await page.waitForLoadState("networkidle").catch(() => {})
    await page.locator('[data-testid="compta-page"]:visible').waitFor()
  }
  const valeur = async (id) => Number(await page.locator('[data-testid="' + id + '"]:visible').getAttribute("data-valeur"))
  const attenteCompta = () => valeur("compta-attente")
  const compteBalance = async (c) => {
    const l = page.locator('tr[data-compte="' + c + '"]:visible')
    return { d: Number(await l.getAttribute("data-debit")), c: Number(await l.getAttribute("data-credit")) }
  }
  const comptabiliser = async (texte) => {
    await page.getByRole("button", { name: "Comptabiliser maintenant" }).click()
    await texteVisible(page, texte).waitFor()
  }
  const nbEcritures = (where = {}) => db.ecritureCompta.count({ where: { etablissementId: E.id, ...where } })
  const desequilibres = () =>
    db.$queryRaw`SELECT e.id FROM ecritures_compta e JOIN ecriture_lignes l ON l."ecritureId" = e.id WHERE e."etablissementId" = ${E.id} GROUP BY e.id HAVING SUM(l.debit) <> SUM(l.credit)`
  const saisir = async (o) => {
    await page.locator("#sa-date:visible").fill(o.date ?? AUJ)
    await page.locator("#sa-libelle:visible").fill(o.libelle)
    await page.locator("#sa-debit:visible").selectOption(o.debit)
    await page.locator("#sa-credit:visible").selectOption(o.credit)
    await page.locator("#sa-montant:visible").fill(o.montant)
    await page.getByRole("button", { name: "Enregistrer l'écriture" }).click()
  }
  const clore = async (periode) => {
    await page.locator("#cl-periode:visible").fill(periode)
    await page.getByRole("button", { name: "Clôturer la période" }).click()
  }

  await etape("Accès : le caissier est renvoyé à l'accueil, le comptable voit 14 pièces en attente et aucune écriture", async () => {
    const caisse = await connecter(BASE, CAISSE, mdpCaisse)
    await caisse.goto(BASE + "/comptabilite", { waitUntil: "load" })
    await caisse.waitForURL((u) => u.pathname === "/")
    await aller("journal")
    verifier((await attenteCompta()) === 14, "quatorze pièces en attente")
    verifier((await page.locator("tbody[data-ecriture]:visible").count()) === 0 && (await nbEcritures()) === 0, "aucune écriture avant comptabilisation")
  })

  await etape("Comptabilisation : 14 écritures équilibrées, rejouable sans doublon", async () => {
    await comptabiliser("14 écriture(s) comptabilisée(s)")
    await attendre(async () => (await nbEcritures()) === 14, "quatorze écritures en base")
    verifier((await desequilibres()).length === 0, "toutes les écritures sont équilibrées")
    await aller("journal")
    verifier((await page.locator("tbody[data-ecriture]:visible").count()) === 14, "quatorze écritures affichées")
    verifier((await attenteCompta()) === 0, "plus rien en attente")
    await comptabiliser("Rien à comptabiliser")
    verifier((await nbEcritures()) === 14, "toujours quatorze écritures")
  })

  await etape("Balance : soldes exacts par compte, total débit = total crédit", async () => {
    await aller("balance")
    const attendus = { "411": [13000, 8000], "706": [3000, 14000], "571": [9000, 0], "5212": [1000, 0], "5211": [2000, 0], "4191": [1100, 7300], "321": [2500, 1750], "401": [0, 2500], "6032": [1500, 0], "658": [550, 0], "758": [0, 100] }
    for (const [compte, [d, c]] of Object.entries(attendus)) {
      const l = await compteBalance(compte)
      verifier(l.d === d && l.c === c, "compte " + compte + " : " + l.d + "/" + l.c + " au lieu de " + d + "/" + c)
    }
    const total = page.locator('[data-testid="balance-total"]:visible')
    const td = await total.getAttribute("data-debit")
    verifier(td === (await total.getAttribute("data-credit")) && td === "33650", "total équilibré à 33650")
  })

  await etape("Grand livre, indicateurs et résultat", async () => {
    await aller("grand-livre", "&compte=411")
    verifier((await page.locator("tr[data-ligne]:visible").count()) === 5, "cinq lignes sur le compte 411")
    verifier((await valeur("gl-solde")) === 5000, "solde clients 5000")
    verifier((await valeur("kpi-produits")) === 11100 && (await valeur("kpi-charges")) === 2050 && (await valeur("kpi-resultat")) === 9050, "produits 11100, charges 2050, résultat 9050")
    verifier((await valeur("kpi-tresorerie")) === 12000 && (await valeur("kpi-clients")) === 5000, "trésorerie 12000, clients 5000")
    verifier((await valeur("kpi-fournisseurs")) === 2500 && (await valeur("kpi-stock")) === 750 && (await valeur("kpi-avances")) === 6200, "fournisseurs 2500, stock 750, avances 6200")
    await aller("resultat")
    await page.locator('[data-testid="resultat"]:visible').waitFor()
  })

  await etape("Saisie manuelle : comptes identiques et montant nul refusés, règlement fournisseur enregistré", async () => {
    await aller("journal")
    await saisir({ libelle: "ZZ test refus", debit: "401", credit: "401", montant: "1000" })
    await texteVisible(page, "deux comptes différents").waitFor()
    await saisir({ libelle: "ZZ test refus", debit: "401", credit: "571", montant: "0" })
    await texteVisible(page, "Montant invalide").waitFor()
    verifier((await nbEcritures()) === 14, "rien d'enregistré après les refus")
    await saisir({ libelle: "ZZ règlement fournisseur", debit: "401", credit: "571", montant: "1000" })
    await texteVisible(page, "enregistrée").waitFor()
    await attendre(async () => (await nbEcritures()) === 15, "quinze écritures")
    await aller("journal")
    verifier((await valeur("kpi-fournisseurs")) === 1500 && (await valeur("kpi-tresorerie")) === 11000, "fournisseurs 1500 et trésorerie 11000")
  })

  await etape("Contrepassation : une seule fois, soldes rétablis", async () => {
    await aller("journal")
    const ligne = page.locator('tbody[data-libelle="ZZ règlement fournisseur"]:visible')
    await ligne.getByRole("button", { name: "Contrepasser" }).click()
    await attendre(async () => (await nbEcritures({ sourceType: "CONTRE" })) === 1, "contrepassation créée")
    await aller("journal")
    verifier((await page.locator('tbody[data-libelle="ZZ règlement fournisseur"]:visible').getByRole("button", { name: "Contrepasser" }).count()) === 0, "plus de bouton sur l'écriture contrepassée")
    verifier((await page.locator('tbody[data-source="CONTRE"]:visible').getByRole("button", { name: "Contrepasser" }).count()) === 0, "une contrepassation ne se contrepasse pas")
    verifier((await valeur("kpi-fournisseurs")) === 2500 && (await valeur("kpi-tresorerie")) === 12000, "soldes rétablis")
    verifier((await nbEcritures({ sourceType: "CONTRE" })) === 1, "une seule contrepassation")
  })

  await etape("Nouvelle pièce : seul le règlement ajouté est comptabilisé", async () => {
    await db.reglement.create({ data: { etablissementId: E.id, factureId: F1.id, montant: 500, methode: "CASH" } })
    await aller("journal")
    verifier((await attenteCompta()) === 1, "une pièce en attente")
    await comptabiliser("1 écriture(s) comptabilisée(s)")
    const s = await db.ecritureLigne.aggregate({ where: { compte: "411", ecriture: { etablissementId: E.id } }, _sum: { credit: true } })
    verifier(s._sum.credit === 8500, "créances soldées à hauteur de 8500")
  })

  await etape("Clôture : mois passé seulement, dans l'ordre, pièce tardive rattachée au mois ouvert, saisie refusée en période close", async () => {
    const F3 = await facture(3, 2000, "ISSUED", dateUtc(jourPrec(10)))
    await aller("journal")
    verifier((await attenteCompta()) === 1, "la facture du mois passé attend")
    await comptabiliser("1 écriture(s) comptabilisée(s)")
    const e3 = await db.ecritureCompta.findFirst({ where: { etablissementId: E.id, sourceType: "FACT", sourceId: F3.id } })
    verifier(e3 && e3.date.toISOString().slice(0, 10) === jourPrec(10), "facture datée du mois passé")
    await aller("cloture")
    await clore(MOIS)
    await texteVisible(page, "pas terminée").waitFor()
    await clore(PREC)
    await attendre(async () => (await db.clotureCompta.count({ where: { etablissementId: E.id, periode: PREC } })) === 1, "mois précédent clôturé")
    await clore(PREC)
    await texteVisible(page, "déjà clôturée").waitFor()
    const tard = await db.reglement.create({ data: { etablissementId: E.id, factureId: F3.id, montant: 500, methode: "CASH", createdAt: new Date(jourPrec(20) + "T12:00:00.000Z") } })
    await aller("journal")
    await comptabiliser("1 écriture(s) comptabilisée(s)")
    const rattrape = await db.ecritureCompta.findFirst({ where: { etablissementId: E.id, sourceType: "REGL", sourceId: tard.id } })
    verifier(rattrape && rattrape.date.toISOString().slice(0, 10) === MOIS + "-01" && rattrape.libelle.includes("rattrapage"), "règlement tardif rattaché au premier jour du mois ouvert")
    await saisir({ date: jourPrec(15), libelle: "ZZ en période close", debit: "401", credit: "571", montant: "100" })
    await texteVisible(page, "clôturée").waitFor()
    verifier((await nbEcritures({ libelle: "ZZ en période close" })) === 0, "aucune écriture en période close")
  })

  await etape("Export CSV : journal et balance pour le comptable, formules neutralisées, refusé au caissier", async () => {
    await db.ecritureCompta.create({ data: { etablissementId: E.id, numero: 9000, journal: "OD", date: dateUtc(AUJ), libelle: "=1+1", lignes: { create: [{ compte: "401", debit: 10, credit: 0 }, { compte: "571", debit: 0, credit: 10 }] } } })
    const j = await page.context().request.get(BASE + "/api/comptabilite/export?type=journal&periode=tout")
    verifier(j.status() === 200 && (j.headers()["content-type"] ?? "").includes("text/csv"), "journal en CSV")
    const corps = await j.text()
    verifier(corps.includes("Numero") && corps.includes("FAC-00001") && corps.includes('"\'=1+1"'), "contenu du journal, formule neutralisée")
    const b = await page.context().request.get(BASE + "/api/comptabilite/export?type=balance&periode=tout")
    verifier(b.status() === 200 && (await b.text()).includes("411"), "balance en CSV")
    const caisse = await connecter(BASE, CAISSE, mdpCaisse)
    verifier((await caisse.context().request.get(BASE + "/api/comptabilite/export?type=journal&periode=tout")).status() === 403, "export refusé au caissier")
  })

  await etape("Audit, numérotation continue, équilibre et isolation entre établissements", async () => {
    for (const a of ["COMPTA_COMPTABILISEE", "COMPTA_ECRITURE", "COMPTA_CONTREPASSE", "COMPTA_CLOTURE", "COMPTA_EXPORT"]) {
      verifier(!!(await db.auditLog.findFirst({ where: { action: a, userEmail: COMPTA } })), "audit " + a)
    }
    const numeros = (await db.ecritureCompta.findMany({ where: { etablissementId: E.id, numero: { lt: 9000 } }, select: { numero: true }, orderBy: { numero: "asc" } })).map((x) => x.numero)
    verifier(numeros.every((n, i) => n === i + 1), "numérotation continue sans trou")
    verifier((await desequilibres()).length === 0, "toutes les écritures restent équilibrées")
    verifier((await db.ecritureCompta.count({ where: { etablissementId: E2.id } })) === 0, "aucune écriture dans l'autre établissement")
  })

  await terminer(nettoyer, "COMPTABILITE", 0)
}

principal().catch(async (e) => {
  console.error("Echec : " + (e && e.message ? e.message : e))
  await terminer(nettoyer, "COMPTABILITE", 1)
})