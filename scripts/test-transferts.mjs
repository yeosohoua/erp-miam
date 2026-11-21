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

const PORT = 3129
const BASE = "http://localhost:" + PORT
const mdpMag = secret()
const mdpChef = secret()
const mdpOut = secret()
const mdpRh = secret()
const MAG = "test-tr-mag@miam.test"
const CHEF = "test-tr-chef@miam.test"
const OUT = "test-tr-out@miam.test"
const RH = "test-tr-rh@miam.test"
const EMAILS = [MAG, CHEF, OUT, RH]

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: { in: EMAILS } } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-TS", name: "ZZ Cuisine Centrale", type: "OTHER", prepaye: true } })
  const E2 = await db.etablissement.create({ data: { code: "ZZ-TD", name: "ZZ Ecole Destinataire", type: "SCHOOL", prepaye: true } })
  const E3 = await db.etablissement.create({ data: { code: "ZZ-TX", name: "ZZ Autre Site", type: "SCHOOL", prepaye: true } })
  const creerUser = (email, name, role, mdp, etab) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: etab.id }] } } })
  await creerUser(MAG, "Test Tr Mag", "STOREKEEPER", mdpMag, E)
  await creerUser(CHEF, "Test Tr Chef", "CHEF", mdpChef, E2)
  await creerUser(OUT, "Test Tr Out", "MANAGER", mdpOut, E3)
  await creerUser(RH, "Test Tr Rh", "HR", mdpRh, E)

  const ing = (etab, name, cout, stock) => db.ingredient.create({ data: { etablissementId: etab.id, name, unit: "kg", unitCost: cout, stock } })
  const riz = await ing(E, "ZZ Riz", 820, 100)
  const huile = await ing(E, "ZZ Huile", 1500, 20)
  const huileDest = await ing(E2, "ZZ Huile", 1500, 2)
  const autre = await ing(E2, "ZZ Specifique Destinataire", 100, 0)
  const lot = (etab, i, reference, qte, prix, per) => db.lot.create({ data: { etablissementId: etab.id, ingredientId: i.id, reference, quantite: qte, restante: qte, prix, peremption: per ? new Date(per) : null } })
  const lotA = await lot(E, riz, "L-A", 40, 800, "2027-01-10")
  const lotB = await lot(E, riz, "L-B", 60, 900, "2027-06-01")
  await lot(E, huile, "L-H", 20, 1500, null)

  await demarrer(BASE, PORT)
  const mag = await connecter(BASE, MAG, mdpMag)
  const chef = await connecter(BASE, CHEF, mdpChef)
  const out = await connecter(BASE, OUT, mdpOut)
  const rh = await connecter(BASE, RH, mdpRh)
  const texte = (p, t) => p.getByText(t).filter({ visible: true }).first()
  const aller = async (p, chemin, testid) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
  }
  const creer = async (p, o) => {
    const f = p.locator('[data-testid="form-transfert"]:visible')
    await f.locator("#tr-dest").selectOption(o.dest ?? "")
    await f.locator("#tr-note").fill(o.note ?? "")
    for (let i = 0; i < 5; i++) {
      const l = (o.lignes ?? [])[i]
      await f.locator("#tr-ing-" + i).selectOption(l ? l.ing : "")
      await f.locator("#tr-qte-" + i).fill(l ? l.qte : "")
    }
    await f.getByRole("button", { name: "Préparer le transfert" }).click()
  }
  const stock = async (id) => Number((await db.ingredient.findUnique({ where: { id } })).stock)
  const restante = async (id) => Number((await db.lot.findUnique({ where: { id } })).restante)

  await etape("Accès : magasin et cuisine voient la page ; la RH n'a ni la page ni l'entrée de menu", async () => {
    for (const p of [mag, chef]) {
      await aller(p, "/transferts", "transferts-page")
      verifier((await p.locator('[data-testid="menu-principal"] a[href="/transferts"]').count()) >= 1, "entrée de menu Cuisine centrale")
    }
    await aller(rh, "/transferts", "acces-refuse")
    verifier((await rh.locator('[data-testid="transferts-page"]').count()) === 0, "la RH n'accède pas à la page")
    verifier((await rh.locator('[data-testid="menu-principal"] a[href="/transferts"]').count()) === 0, "pas d'entrée de menu pour la RH")
  })

  await etape("Création : saisies invalides refusées, numérotation par source, aucun mouvement de stock", async () => {
    await aller(mag, "/transferts?vue=nouveau", "form-transfert")
    verifier((await mag.locator('#tr-dest option[value="' + E.id + '"]').count()) === 0, "l'établissement source n'est pas proposé comme destination")
    verifier((await mag.locator('#tr-dest option[value="' + E2.id + '"]').count()) === 1, "l'établissement destinataire est proposé")
    verifier((await mag.locator('#tr-ing-0 option[value="' + huileDest.id + '"]').count()) === 0, "l'ingrédient d'un autre établissement n'est pas proposé")
    await creer(mag, { dest: "", lignes: [{ ing: riz.id, qte: "5" }] })
    await texte(mag, "Choisissez la destination").waitFor()
    await creer(mag, { dest: E2.id, lignes: [] })
    await texte(mag, "Ajoutez au moins une ligne").waitFor()
    await creer(mag, { dest: E2.id, lignes: [{ ing: riz.id, qte: "0" }] })
    await texte(mag, "Quantité invalide").waitFor()
    await creer(mag, { dest: E2.id, lignes: [{ ing: riz.id, qte: "5" }, { ing: riz.id, qte: "6" }] })
    await texte(mag, "en double").waitFor()
    verifier((await db.transfert.count({ where: { sourceId: E.id } })) === 0, "rien n'est créé après les refus")
    await creer(mag, { dest: E2.id, note: "Livraison du lundi", lignes: [{ ing: riz.id, qte: "50" }, { ing: huile.id, qte: "5" }] })
    await texte(mag, "Transfert n° 1 créé").waitFor()
    await creer(mag, { dest: E2.id, lignes: [{ ing: riz.id, qte: "500" }] })
    await texte(mag, "Transfert n° 2 créé").waitFor()
    const ts = await db.transfert.findMany({ where: { sourceId: E.id }, orderBy: { numero: "asc" }, include: { lignes: true } })
    verifier(ts.length === 2 && ts[0].numero === 1 && ts[1].numero === 2, "numéros 1 et 2")
    verifier(ts.every((t) => t.statut === "PREPARE" && t.destId === E2.id), "transferts préparés vers la destination")
    verifier(ts[0].lignes.length === 2 && ts[0].note === "Livraison du lundi", "lignes et note du premier transfert")
    verifier((await stock(riz.id)) === 100 && (await stock(huile.id)) === 20, "le stock ne bouge pas à la création")
  })

  await etape("Expédition : stock insuffisant refusé sans rien bouger ; sortie FEFO et coût moyen pondéré", async () => {
    await aller(mag, "/transferts?vue=sortants", "table-sortants")
    await mag.locator('[data-transfert="2"]').getByRole("button", { name: "Expédier" }).click()
    await texte(mag, "Stock insuffisant pour ZZ Riz").waitFor()
    verifier((await db.transfert.findFirst({ where: { sourceId: E.id, numero: 2 } })).statut === "PREPARE", "le transfert 2 reste préparé")
    verifier((await stock(riz.id)) === 100 && (await restante(lotA.id)) === 40 && (await restante(lotB.id)) === 60, "aucun stock bougé après le refus")
    await mag.locator('[data-transfert="1"]').getByRole("button", { name: "Expédier" }).click()
    await attendre(async () => (await db.transfert.findFirst({ where: { sourceId: E.id, numero: 1 } })).statut === "EXPEDIE", "transfert 1 expédié")
    verifier((await stock(riz.id)) === 50 && (await stock(huile.id)) === 15, "stock source décrémenté")
    verifier((await restante(lotA.id)) === 0 && (await restante(lotB.id)) === 50, "lot à péremption proche vidé en premier")
    const t1 = await db.transfert.findFirst({ where: { sourceId: E.id, numero: 1 }, include: { lignes: true } })
    verifier(t1.expediLe !== null && t1.recuLe === null, "date d'expédition renseignée")
    const cout = (nom) => Number(t1.lignes.find((l) => l.ingredientNom === nom).cout)
    verifier(cout("ZZ Riz") === 820 && cout("ZZ Huile") === 1500, "coût moyen pondéré : riz 820, huile 1500")
    verifier((await db.mouvementStock.count({ where: { etablissementId: E.id, ingredientId: riz.id, note: "Transfert ZZ-TS-1", type: "SORTIE" } })) === 2, "deux mouvements de sortie pour le riz")
    verifier((await db.ingredient.count({ where: { etablissementId: E2.id, name: "ZZ Riz" } })) === 0, "rien n'arrive à destination avant la réception")
    verifier((await stock(huileDest.id)) === 2, "stock destinataire inchangé avant réception")
    await aller(mag, "/transferts?vue=sortants", "table-sortants")
    verifier((await mag.locator('[data-transfert="1"]').getByRole("button").count()) === 0, "plus aucune action sur un transfert expédié")
  })

  await etape("Réception : seul le destinataire reçoit ; ingrédient créé, lots avec péremption et prix d'origine", async () => {
    await aller(mag, "/transferts?vue=entrants", "table-entrants")
    verifier((await mag.locator('[data-entrant="TR-ZZ-TS-1"]').count()) === 0, "la source ne voit pas son envoi dans les entrants")
    await aller(out, "/transferts?vue=entrants", "table-entrants")
    verifier((await out.locator('[data-entrant]').count()) === 0, "un tiers ne voit pas le transfert")
    await aller(chef, "/transferts?vue=entrants", "table-entrants")
    verifier((await chef.locator('[data-entrant="TR-ZZ-TS-1"]').count()) === 1, "le destinataire voit le transfert")
    verifier((await chef.locator('[data-entrant="TR-ZZ-TS-2"]').count()) === 0, "un transfert encore préparé n'est pas annoncé")
    await chef.locator('[data-entrant="TR-ZZ-TS-1"]').getByRole("button", { name: "Recevoir" }).click()
    await attendre(async () => (await db.transfert.findFirst({ where: { sourceId: E.id, numero: 1 } })).statut === "RECU", "transfert 1 reçu")
    const rizDest = await db.ingredient.findFirst({ where: { etablissementId: E2.id, name: "ZZ Riz" } })
    verifier(rizDest && Number(rizDest.stock) === 50 && rizDest.unit === "kg" && Number(rizDest.unitCost) === 820, "riz créé à destination avec 50 kg et le coût moyen")
    const lots = await db.lot.findMany({ where: { ingredientId: rizDest.id }, orderBy: { peremption: "asc" } })
    verifier(lots.length === 2, "deux lots recréés")
    verifier(Number(lots[0].restante) === 40 && Number(lots[0].prix) === 800 && lots[0].peremption.toISOString().slice(0, 10) === "2027-01-10", "lot 1 : 40 kg à 800, péremption d'origine")
    verifier(Number(lots[1].restante) === 10 && Number(lots[1].prix) === 900 && lots[1].peremption.toISOString().slice(0, 10) === "2027-06-01", "lot 2 : 10 kg à 900, péremption d'origine")
    verifier((await stock(huileDest.id)) === 7, "huile existante : 2 + 5 = 7")
    verifier((await db.mouvementStock.count({ where: { etablissementId: E2.id, type: "ENTREE", reference: "TR-ZZ-TS-1" } })) === 3, "trois mouvements d'entrée tracés")
    verifier((await stock(riz.id)) === 50, "le stock de la source ne change pas à la réception")
    await aller(chef, "/transferts?vue=entrants", "table-entrants")
    verifier((await chef.locator('[data-entrant="TR-ZZ-TS-1"]').getByRole("button").count()) === 0, "pas de seconde réception possible")
  })

  await etape("Annulation, isolation et audit", async () => {
    await aller(mag, "/transferts?vue=sortants", "table-sortants")
    verifier((await mag.locator('[data-transfert="1"]').getByRole("button").count()) === 0, "un transfert reçu n'a plus d'action")
    await mag.locator('[data-transfert="2"]').getByRole("button", { name: "Annuler" }).click()
    await attendre(async () => (await db.transfert.findFirst({ where: { sourceId: E.id, numero: 2 } })).statut === "ANNULE", "transfert 2 annulé")
    verifier((await stock(riz.id)) === 50 && (await db.mouvementStock.count({ where: { etablissementId: E.id, note: "Transfert ZZ-TS-2" } })) === 0, "l'annulation ne touche pas au stock")
    await aller(out, "/transferts?vue=sortants", "table-sortants")
    verifier((await out.locator("[data-transfert]").count()) === 0, "un autre site ne voit aucun transfert sortant")
    const anonyme = await fetch(BASE + "/transferts", { redirect: "manual" })
    verifier([301, 302, 303, 307, 308].includes(anonyme.status), "accès anonyme redirigé, statut " + anonyme.status)
    const compte = (email, action) => db.auditLog.count({ where: { userEmail: email, action } })
    verifier((await compte(MAG, "TRANSFERT_CREE")) >= 2, "audit des créations")
    verifier((await compte(MAG, "TRANSFERT_EXPEDIE")) >= 1, "audit de l'expédition")
    verifier((await compte(MAG, "TRANSFERT_ANNULE")) >= 1, "audit de l'annulation")
    verifier((await compte(CHEF, "TRANSFERT_RECU")) >= 1, "audit de la réception")
    verifier(autre.id !== null, "jeu de données cohérent")
  })
}

principal()
  .then(() => terminer(nettoyer, "TRANSFERTS", 0))
  .catch((e) => {
    console.log("ERREUR : " + e.message)
    return terminer(nettoyer, "TRANSFERTS", 1)
  })