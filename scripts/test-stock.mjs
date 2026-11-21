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
const jourDecale = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
const dateUtc = (iso) => new Date(iso + "T00:00:00.000Z")
const AUJ = jourDecale(0)

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
  const p = await (await navigateur.newContext({ locale: "fr-FR", viewport: { width: 1440, height: 1000 } })).newPage()
  p.setDefaultTimeout(30000)
  return p
}

async function connecter(BASE, email, mdp) {
  const p = await nouvellePage()
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

const PORT = 3112
const BASE = "http://localhost:" + PORT
const mdpAchat = secret()
const mdpMagasin = secret()
const mdpChef = secret()
const mdpAutre = secret()
const ACHAT = "test-st-achat@miam.test"
const MAGASIN = "test-st-magasin@miam.test"
const CHEF = "test-st-chef@miam.test"
const AUTRE = "test-st-autre@miam.test"
const EMAILS = [ACHAT, MAGASIN, CHEF, AUTRE]

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { OR: [{ userEmail: { in: EMAILS } }, { details: { contains: "ZZ" } }] } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const IA = await db.etablissement.create({ data: { code: "ZZ-ST", name: "ZZ Cantine ST", type: "COMPANY" } })
  const IB = await db.etablissement.create({ data: { code: "ZZ-SU", name: "ZZ Cantine SU", type: "COMPANY" } })
  const creerUser = (email, name, role, mdp, etab) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: etab.id }] } } })
  await creerUser(ACHAT, "Test St Achat", "PURCHASER", mdpAchat, IA)
  await creerUser(MAGASIN, "Test St Magasin", "STOREKEEPER", mdpMagasin, IA)
  await creerUser(CHEF, "Test St Chef", "CHEF", mdpChef, IA)
  await creerUser(AUTRE, "Test St Autre", "MANAGER", mdpAutre, IB)

  const riz = await db.ingredient.create({ data: { etablissementId: IA.id, name: "ZZ Riz", unit: "kg" } })
  const poulet = await db.ingredient.create({ data: { etablissementId: IA.id, name: "ZZ Poulet", unit: "kg" } })
  const huile = await db.ingredient.create({ data: { etablissementId: IA.id, name: "ZZ Huile", unit: "l" } })
  const plat = await db.plat.create({ data: { etablissementId: IA.id, name: "ZZ Riz poulet", portions: 10 } })
  await db.platIngredient.createMany({
    data: [
      { platId: plat.id, ingredientId: riz.id, quantity: 2 },
      { platId: plat.id, ingredientId: poulet.id, quantity: 3 },
    ],
  })
  await db.menu.create({ data: { etablissementId: IA.id, date: dateUtc(AUJ), service: "LUNCH", statut: "PUBLISHED", plats: { create: [{ platId: plat.id }] } } })
  for (let n = 1; n <= 5; n++) {
    const ins = await db.inscrit.create({ data: { etablissementId: IA.id, matricule: "ZZS-" + n, firstName: "St", lastName: "Nom" + n, badge: "ZZS" + String(n).padStart(13, "0") } })
    await db.reservation.create({ data: { etablissementId: IA.id, inscritId: ins.id, date: dateUtc(AUJ), service: "LUNCH", statut: "BOOKED", servedAt: new Date() } })
  }

  const ouvrir = async (p, chemin, testid) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
    await sleep(300)
  }
  const cheminAttendu = (p, chemin, message) => attendre(() => new URL(p.url()).pathname === chemin, message)
  const stockDe = async (nom) => Number((await db.ingredient.findFirst({ where: { etablissementId: IA.id, name: nom } })).stock)
  const lotDe = (ref) => db.lot.findFirst({ where: { etablissementId: IA.id, reference: ref } })
  const kpi = async (p, id) => Number(await p.locator('[data-testid="' + id + '"]:visible').getAttribute("data-valeur"))

  await demarrer(BASE, PORT)
  const achat = await connecter(BASE, ACHAT, mdpAchat)
  const magasin = await connecter(BASE, MAGASIN, mdpMagasin)
  let bonId = ""

  await etape("Fournisseurs : validations, doublon refusé, suppression", async () => {
    await ouvrir(achat, "/achats", "achats-page")
    const f = achat.locator('[data-testid="form-fournisseur"]:visible')
    const creer = () => f.getByRole("button", { name: "Créer le fournisseur" }).click()
    await f.locator("#fo-name").fill("A")
    await creer()
    await f.getByText("2 à 80 caractères").waitFor()
    await f.locator("#fo-name").fill("ZZ Fournisseur Un")
    await f.locator("#fo-email").fill("pasunemail")
    await creer()
    await f.getByText("Adresse e-mail invalide.").waitFor()
    verifier((await db.fournisseur.count({ where: { etablissementId: IA.id } })) === 0, "aucun fournisseur créé avec des données invalides")
    await f.locator("#fo-name").fill("ZZ Fournisseur Un")
    await creer()
    await attendre(async () => (await db.fournisseur.count({ where: { etablissementId: IA.id } })) === 1, "fournisseur 1 créé")
    await sleep(500)
    await f.locator("#fo-name").fill("ZZ Fournisseur Deux")
    await creer()
    await attendre(async () => (await db.fournisseur.count({ where: { etablissementId: IA.id } })) === 2, "fournisseur 2 créé")
    await sleep(500)
    await f.locator("#fo-name").fill("ZZ Fournisseur Un")
    await creer()
    await f.getByText("Un fournisseur porte déjà ce nom.").waitFor()
    verifier((await db.fournisseur.count({ where: { etablissementId: IA.id } })) === 2, "doublon refusé")
    await achat.locator('tr[data-fournisseur="ZZ Fournisseur Deux"]:visible').getByRole("button", { name: "Supprimer" }).click()
    await attendre(async () => (await db.fournisseur.count({ where: { etablissementId: IA.id } })) === 1, "fournisseur 2 supprimé")
  })

  await etape("Bon de commande : brouillon, lignes, doublon, retrait, total, envoi et numéro", async () => {
    await ouvrir(achat, "/achats", "achats-page")
    const f = achat.locator('[data-testid="form-bon"]:visible')
    const creer = async () => {
      await f.locator("#bn-fournisseur").selectOption({ label: "ZZ Fournisseur Un" })
      await f.getByRole("button", { name: "Créer le bon de commande" }).click()
      await attendre(() => /^\/achats\/[^/]+$/.test(new URL(achat.url()).pathname), "ouverture du bon")
      await achat.locator('[data-testid="bon-detail"]:visible').waitFor()
      await sleep(300)
    }
    await creer()
    await achat.getByRole("button", { name: "Supprimer le brouillon" }).click()
    await cheminAttendu(achat, "/achats", "retour à la liste après suppression")
    verifier((await db.bonCommande.count({ where: { etablissementId: IA.id } })) === 0, "brouillon supprimé")
    await achat.locator('[data-testid="achats-page"]').waitFor()
    await creer()
    bonId = new URL(achat.url()).pathname.split("/")[2]

    const ligne = async (nom, qte, prix) => {
      const l = achat.locator('[data-testid="form-ligne"]:visible')
      await l.locator("#li-ingredient").selectOption({ label: nom })
      await l.locator("#li-quantite").fill(qte)
      await l.locator("#li-prix").fill(prix)
      await l.getByRole("button", { name: "Ajouter la ligne" }).click()
      return l
    }
    const nbLignes = () => db.bonCommandeLigne.count({ where: { bonId } })
    let l = await ligne("ZZ Riz (kg)", "0", "600")
    await l.getByText("Quantité invalide : un nombre supérieur à zéro.").waitFor()
    l = await ligne("ZZ Riz (kg)", "50", "abc")
    await l.getByText("Prix invalide : un nombre positif ou nul.").waitFor()
    verifier((await nbLignes()) === 0, "aucune ligne créée avec des données invalides")
    await ligne("ZZ Riz (kg)", "50", "600")
    await attendre(async () => (await nbLignes()) === 1, "ligne Riz ajoutée")
    await sleep(500)
    l = await ligne("ZZ Riz (kg)", "10", "600")
    await l.getByText("Cet ingrédient figure déjà dans le bon.").waitFor()
    await ligne("ZZ Huile (l)", "5", "1000")
    await attendre(async () => (await nbLignes()) === 2, "ligne Huile ajoutée")
    await sleep(500)
    await achat.locator('tr[data-ingredient="ZZ Huile"]:visible').getByRole("button", { name: "Retirer" }).click()
    await attendre(async () => (await nbLignes()) === 1, "ligne Huile retirée")
    await sleep(500)
    await ligne("ZZ Poulet (kg)", "20", "2500")
    await attendre(async () => (await nbLignes()) === 2, "ligne Poulet ajoutée")
    await attendre(async () => (await achat.locator('[data-testid="bon-detail"]:visible').getAttribute("data-total")) === "80000", "total du bon 80000")

    await achat.getByRole("button", { name: "Envoyer le bon" }).click()
    await attendre(async () => (await db.bonCommande.findUnique({ where: { id: bonId } })).statut === "SENT", "bon envoyé")
    verifier((await db.bonCommande.findUnique({ where: { id: bonId } })).numero === 1, "numéro 1")
    await attendre(async () => (await achat.locator('[data-testid="bon-detail"]:visible').getAttribute("data-numero")) === "BC-00001", "numéro affiché")
    verifier((await achat.locator('[data-testid="form-ligne"]:visible').count()) === 0, "bon figé : plus de formulaire de ligne")
    await ouvrir(achat, "/achats", "achats-page")
    verifier((await kpi(achat, "kpi-en-cours")) === 1, "1 bon en cours")
    verifier((await kpi(achat, "kpi-a-recevoir")) === 80000, "80000 à recevoir")
  })

  await etape("Réception : surplus et péremption refusés, partielle puis complète, lots et prix d'achat", async () => {
    await ouvrir(magasin, "/achats/" + bonId, "bon-detail")
    const rf = (nom) => magasin.locator('form[data-testid="form-reception"][data-ingredient="' + nom + '"]:visible')
    const recevoir = async (nom, qte, ref, peremption) => {
      const f = rf(nom)
      await f.locator('input[name="quantite"]').fill(qte)
      await f.locator('input[name="reference"]').fill(ref)
      if (peremption) await f.locator('input[name="peremption"]').fill(peremption)
      await f.getByRole("button", { name: "Réceptionner" }).click()
      return f
    }
    let f = await recevoir("ZZ Riz", "60", "L-X", jourDecale(40))
    await f.getByText("La quantité reçue dépasse le reste à recevoir.").waitFor()
    f = await recevoir("ZZ Riz", "30", "L-X", jourDecale(-1))
    await f.getByText("La date de péremption est dépassée : produit refusé.").waitFor()
    verifier((await db.lot.count({ where: { etablissementId: IA.id } })) === 0, "aucun lot créé par les réceptions refusées")

    await recevoir("ZZ Riz", "30", "L-RIZ-1", jourDecale(40))
    await attendre(async () => (await db.bonCommande.findUnique({ where: { id: bonId } })).statut === "PARTIAL", "bon partiellement reçu")
    verifier((await stockDe("ZZ Riz")) === 30, "stock Riz 30")
    verifier(Number((await db.ingredient.findFirst({ where: { etablissementId: IA.id, name: "ZZ Riz" } })).unitCost) === 600, "coût unitaire Riz = prix d'achat")
    await sleep(800)
    await recevoir("ZZ Riz", "20", "L-RIZ-2", jourDecale(10))
    await attendre(async () => (await stockDe("ZZ Riz")) === 50, "stock Riz 50")
    await sleep(800)
    await recevoir("ZZ Poulet", "20", "L-POU-1", jourDecale(3))
    await attendre(async () => (await db.bonCommande.findUnique({ where: { id: bonId } })).statut === "RECEIVED", "bon reçu")
    verifier((await stockDe("ZZ Poulet")) === 20, "stock Poulet 20")
    verifier((await db.mouvementStock.count({ where: { etablissementId: IA.id, type: "ENTREE" } })) === 3, "3 mouvements d'entrée")
    await ouvrir(magasin, "/achats", "achats-page")
    verifier((await kpi(magasin, "kpi-recu-mois")) === 80000, "80000 reçus ce mois")
    verifier((await kpi(magasin, "kpi-en-cours")) === 0, "plus aucun bon en cours")
  })

  await etape("Page Stock : valeur, alerte péremption, seuil, lot périmé", async () => {
    await ouvrir(magasin, "/stock", "stock-page")
    verifier((await kpi(magasin, "kpi-valeur")) === 80000, "valeur du stock 80000")
    verifier((await kpi(magasin, "kpi-bientot")) === 1, "1 lot bientôt périmé")
    const s = magasin.locator('[data-testid="form-seuil"]:visible')
    await s.locator("#sl-ingredient").selectOption({ label: "ZZ Poulet (kg)" })
    await s.locator("#sl-seuil").fill("abc")
    await s.getByRole("button", { name: "Définir le seuil" }).click()
    await s.getByText("Quantité invalide : un nombre positif ou nul.").waitFor()
    await s.locator("#sl-ingredient").selectOption({ label: "ZZ Poulet (kg)" })
    await s.locator("#sl-seuil").fill("25")
    await s.getByRole("button", { name: "Définir le seuil" }).click()
    await attendre(async () => Number((await db.ingredient.findFirst({ where: { etablissementId: IA.id, name: "ZZ Poulet" } })).seuil) === 25, "seuil enregistré")
    await attendre(async () => (await magasin.locator('tr[data-ingredient="ZZ Poulet"]:visible').getAttribute("data-statut")) === "bas", "Poulet en stock bas")
    await db.lot.updateMany({ where: { etablissementId: IA.id, reference: "L-RIZ-1" }, data: { peremption: dateUtc(jourDecale(-1)) } })
    await ouvrir(magasin, "/stock", "stock-page")
    verifier((await kpi(magasin, "kpi-perimes")) === 1, "1 lot périmé")
    verifier((await magasin.locator('tr[data-lot-ref="L-RIZ-1"]:visible').getAttribute("data-etat")) === "perime", "lot L-RIZ-1 marqué périmé")
  })

  await etape("Pertes, inventaire et rebut d'un lot périmé", async () => {
    await ouvrir(magasin, "/stock", "stock-page")
    const a = magasin.locator('[data-testid="form-ajustement-stock"]:visible')
    const ajuster = async (nom, type, qte, note) => {
      await a.locator("#aj-ingredient").selectOption({ label: nom })
      await a.locator("#aj-type").selectOption(type)
      await a.locator("#aj-quantite").fill(qte)
      await a.locator("#aj-note").fill(note)
      await a.getByRole("button", { name: "Enregistrer" }).click()
    }
    await ajuster("ZZ Poulet (kg)", "PERTE", "100", "Plateau tombé")
    await a.getByText("La perte dépasse le stock disponible.").waitFor()
    await ajuster("ZZ Poulet (kg)", "PERTE", "2", "ab")
    await a.getByText("Indiquez le motif (3 caractères minimum).").waitFor()
    verifier((await stockDe("ZZ Poulet")) === 20, "Poulet inchangé après refus")
    await ajuster("ZZ Poulet (kg)", "PERTE", "2", "Plateau tombé")
    await attendre(async () => (await stockDe("ZZ Poulet")) === 18, "Poulet 18 après perte")
    await sleep(800)
    await ajuster("ZZ Riz (kg)", "INVENTAIRE", "49.5", "Comptage de fin de semaine")
    await attendre(async () => (await stockDe("ZZ Riz")) === 49.5, "Riz 49,5 après inventaire")
    verifier(Number((await lotDe("L-RIZ-1")).restante) === 29.5, "l'écart est retiré du lot qui périme en premier")
    await sleep(800)
    await ajuster("ZZ Huile (l)", "INVENTAIRE", "4", "Comptage initial")
    await attendre(async () => (await stockDe("ZZ Huile")) === 4, "Huile 4 après inventaire")
    verifier(Number((await lotDe("Inventaire")).restante) === 4, "lot d'inventaire créé pour l'huile")

    await ouvrir(magasin, "/stock", "stock-page")
    await magasin.locator('tr[data-lot-ref="L-RIZ-1"]:visible').getByRole("button", { name: "Rebuter" }).click()
    await attendre(async () => (await stockDe("ZZ Riz")) === 20, "Riz 20 après rebut")
    verifier(Number((await lotDe("L-RIZ-1")).restante) === 0, "lot L-RIZ-1 vidé")
  })

  await etape("Consommation : dates refusées, décompte FEFO, une seule fois par créneau", async () => {
    await ouvrir(magasin, "/stock", "stock-page")
    const c = magasin.locator('[data-testid="form-consommation"]:visible')
    const decompter = async (date) => {
      await c.locator("#co-date").fill(date)
      await c.locator("#co-service").selectOption("LUNCH")
      await c.getByRole("button", { name: "Décompter la consommation" }).click()
    }
    await decompter(jourDecale(1))
    await c.getByText("Cette date est dans le futur.").waitFor()
    await decompter(jourDecale(-1))
    await c.getByText("Aucun menu publié pour ce créneau.").waitFor()
    verifier((await db.consommation.count({ where: { etablissementId: IA.id } })) === 0, "aucune consommation créée par les refus")
    await decompter(AUJ)
    await attendre(async () => (await db.consommation.count({ where: { etablissementId: IA.id } })) === 1, "consommation enregistrée")
    verifier((await stockDe("ZZ Riz")) === 19, "Riz 19 (5 repas × 2 kg / 10 portions = 1 kg)")
    verifier((await stockDe("ZZ Poulet")) === 16.5, "Poulet 16,5 (5 × 3 / 10 = 1,5 kg)")
    verifier(Number((await lotDe("L-RIZ-2")).restante) === 19, "lot L-RIZ-2 à 19")
    verifier(Number((await lotDe("L-POU-1")).restante) === 16.5, "lot L-POU-1 à 16,5")
    await sleep(800)
    await decompter(AUJ)
    await c.getByText("Consommation déjà décomptée pour ce créneau.").waitFor()
    verifier((await db.consommation.count({ where: { etablissementId: IA.id } })) === 1, "pas de double décompte")
  })

  await etape("Droits, isolation, cohérence des stocks et audit", async () => {
    const chef = await connecter(BASE, CHEF, mdpChef)
    await ouvrir(chef, "/stock", "stock-page")
    verifier((await chef.locator('[data-testid="form-seuil"]:visible').count()) === 0, "chef : pas de formulaire de seuil")
    verifier((await chef.locator('[data-testid="form-consommation"]:visible').count()) === 0, "chef : pas de formulaire de consommation")
    verifier((await chef.getByRole("button", { name: "Rebuter" }).count()) === 0, "chef : pas de bouton Rebuter")
    await chef.goto(BASE + "/achats", { waitUntil: "load" })
    await cheminAttendu(chef, "/", "chef redirigé hors des achats")

    await ouvrir(magasin, "/achats", "achats-page")
    verifier((await magasin.locator('[data-testid="form-fournisseur"]:visible').count()) === 0, "magasinier : pas de création de fournisseur")
    verifier((await magasin.locator('[data-testid="form-bon"]:visible').count()) === 0, "magasinier : pas de création de bon")

    await ouvrir(achat, "/stock", "stock-page")
    verifier((await achat.locator('[data-testid="form-ajustement-stock"]:visible').count()) === 0, "acheteur : stock en lecture seule")
    await ouvrir(achat, "/achats/" + bonId, "bon-detail")
    verifier((await achat.locator('[data-testid="form-reception"]:visible').count()) === 0, "acheteur : pas de réception")

    const autre = await connecter(BASE, AUTRE, mdpAutre)
    await ouvrir(autre, "/stock", "stock-page")
    verifier((await autre.locator('[data-testid="stock-table"] tr[data-ingredient]').count()) === 0, "autre établissement : aucun ingrédient visible")
    await ouvrir(autre, "/achats", "achats-page")
    verifier((await autre.locator('[data-testid="bons"] tr[data-numero]').count()) === 0, "autre établissement : aucun bon visible")
    await autre.goto(BASE + "/achats/" + bonId, { waitUntil: "load" })
    await autre.waitForLoadState("networkidle").catch(() => {})
    await sleep(500)
    verifier((await autre.locator('[data-testid="bon-detail"]:visible').count()) === 0, "autre établissement : bon d'un autre établissement introuvable")

    for (const ing of await db.ingredient.findMany({ where: { etablissementId: IA.id } })) {
      const mv = await db.mouvementStock.findMany({ where: { ingredientId: ing.id } })
      const lots = await db.lot.findMany({ where: { ingredientId: ing.id } })
      const somMv = Math.round(mv.reduce((s, m) => s + Number(m.quantite), 0) * 1000) / 1000
      const somLots = Math.round(lots.reduce((s, l) => s + Number(l.restante), 0) * 1000) / 1000
      verifier(somMv === Number(ing.stock), ing.name + " : stock = somme des mouvements (" + Number(ing.stock) + " / " + somMv + ")")
      verifier(somLots === Number(ing.stock), ing.name + " : stock = somme des lots (" + Number(ing.stock) + " / " + somLots + ")")
    }

    for (const action of ["FOURNISSEUR_CREE", "BON_CREE", "BON_ENVOYE", "BON_RECEPTION", "STOCK_SEUIL", "STOCK_PERTE", "STOCK_INVENTAIRE", "STOCK_REBUT", "STOCK_CONSOMMATION"]) {
      verifier((await db.auditLog.count({ where: { action, userEmail: { in: EMAILS } } })) > 0, "audit manquant : " + action)
    }
  })

  await terminer(nettoyer, "STOCK", 0)
}

principal().catch(async (e) => {
  console.error("Echec : " + (e && e.message ? e.message : e))
  await terminer(nettoyer, "STOCK", 1)
})