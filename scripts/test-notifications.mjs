import "dotenv/config"
import { randomBytes } from "node:crypto"
import { createServer } from "node:http"
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
const P = AUJ.slice(0, 7)

let serveur = null
let navigateur = null
let simulateur = null
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
  if (simulateur) simulateur.close()
  await nettoyer().catch((e) => console.log("Nettoyage incomplet : " + e.message))
  await db.$disconnect().catch(() => {})
  redis.disconnect()
  const reussies = resultats.filter((r) => r.ok).length
  console.log("")
  console.log("Resultat : " + reussies + " / " + resultats.length + " etapes reussies")
  console.log(code === 0 ? "=== TESTS " + nom + " OK ===" : "=== TESTS " + nom + " ECHEC ===")
  process.exit(code)
}

const PORT = 3113
const PORT_SIM = 3913
const BASE = "http://localhost:" + PORT
const CRON = "cron-secret-test-0123456789"
const mdpMgr = secret()
const mdpChef = secret()
const mdpCaisse = secret()
const mdpMagasin = secret()
const mdpCompta = secret()
const mdpAutre = secret()
const MGR = "test-nt-mgr@miam.test"
const CHEF = "test-nt-chef@miam.test"
const CAISSE = "test-nt-caisse@miam.test"
const MAGASIN = "test-nt-magasin@miam.test"
const COMPTA = "test-nt-compta@miam.test"
const AUTRE = "test-nt-autre@miam.test"
const EMAILS = [MGR, CHEF, CAISSE, MAGASIN, COMPTA, AUTRE]

// Simulateur de prestataire : enregistre chaque envoi, ou repond 500 quand "echec" est vrai.
const recus = []
let echec = false
const nb = (pred) => recus.filter(pred).length
const recoit = (pred, message, n = 1) => attendre(() => nb(pred) >= n, message)

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { OR: [{ userEmail: { in: EMAILS } }, { details: { contains: "ZZ" } }] } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  simulateur = createServer((req, res) => {
    let corps = ""
    req.on("data", (d) => (corps += d))
    req.on("end", () => {
      if (echec) {
        res.statusCode = 500
        res.end("KO")
        return
      }
      try {
        recus.push(JSON.parse(corps))
      } catch {
        /* ignore */
      }
      res.end("ok")
    })
  })
  await new Promise((r) => simulateur.listen(PORT_SIM, "127.0.0.1", r))
  process.env.NOTIF_MOCK_URL = "http://127.0.0.1:" + PORT_SIM + "/envoi"
  process.env.CRON_SECRET = CRON

  const IA = await db.etablissement.create({ data: { code: "ZZ-NT", name: "ZZ Cantine NT", type: "SCHOOL", prepaye: true } })
  const IB = await db.etablissement.create({ data: { code: "ZZ-NU", name: "ZZ Cantine NU", type: "SCHOOL" } })
  await db.tarif.create({ data: { etablissementId: IA.id, service: "LUNCH", prix: 500 } })
  const creerUser = (email, name, role, mdp, etab) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: etab.id }] } } })
  await creerUser(MGR, "Test Nt Mgr", "MANAGER", mdpMgr, IA)
  await creerUser(CHEF, "Test Nt Chef", "CHEF", mdpChef, IA)
  await creerUser(CAISSE, "Test Nt Caisse", "CASHIER", mdpCaisse, IA)
  await creerUser(MAGASIN, "Test Nt Magasin", "STOREKEEPER", mdpMagasin, IA)
  await creerUser(COMPTA, "Test Nt Compta", "ACCOUNTANT", mdpCompta, IA)
  await creerUser(AUTRE, "Test Nt Autre", "MANAGER", mdpAutre, IB)

  const client = await db.client.create({ data: { etablissementId: IA.id, name: "ZZ Client NT", email: "client@zz-nt.test", phone: "07 08 09 10 11" } })
  const facture = await db.facture.create({
    data: { etablissementId: IA.id, clientId: client.id, numero: 1, periode: P, statut: "ISSUED", total: 10000, emisLe: new Date(), echeance: dateUtc(jourDecale(-5)) },
  })
  const ins = await db.inscrit.create({
    data: { etablissementId: IA.id, matricule: "ZZN-1", firstName: "Nt", lastName: "Eleve", badge: "ZZN" + "1".padStart(13, "0"), solde: 1500, tuteurs: { create: [{ name: "Parent Nt", phone: "01 02 03 04 05", email: "parent@zz-nt.test" }] } },
  })
  await db.menu.create({ data: { etablissementId: IA.id, date: dateUtc(AUJ), service: "LUNCH", statut: "PUBLISHED" } })
  await db.reservation.create({ data: { etablissementId: IA.id, inscritId: ins.id, date: dateUtc(AUJ), service: "LUNCH", statut: "BOOKED" } })

  const ouvrir = async (p, chemin, testid) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
    await sleep(300)
  }
  const cheminAttendu = (p, chemin, message) => attendre(() => new URL(p.url()).pathname === chemin, message)

  await demarrer(BASE, PORT)
  const mgr = await connecter(BASE, MGR, mdpMgr)

  await etape("Réglages : accès réservé, canaux détectés, seuil contrôlé, enregistrement", async () => {
    const chef = await connecter(BASE, CHEF, mdpChef)
    await chef.goto(BASE + "/parametres/notifications", { waitUntil: "load" })
    await cheminAttendu(chef, "/", "le chef ne voit pas les notifications")
    await ouvrir(mgr, "/parametres/notifications", "notifications-page")
    for (const c of ["SMS", "WHATSAPP", "EMAIL"]) {
      verifier((await mgr.locator('[data-testid="canaux"] tr[data-canal="' + c + '"]').getAttribute("data-configure")) === "1", "canal " + c + " configuré")
    }
    const f = mgr.locator('[data-testid="form-reglages"]:visible')
    verifier((await f.locator("#rg-email").isChecked()) && !(await f.locator("#rg-sms").isChecked()), "par défaut : e-mail seul")
    await f.locator("#rg-seuil").fill("abc")
    await f.getByRole("button", { name: "Enregistrer les réglages" }).click()
    await f.getByText("Seuil invalide").waitFor()
    verifier((await db.parametresNotification.count({ where: { etablissementId: IA.id } })) === 0, "rien d'enregistré avec un seuil invalide")
    await f.locator("#rg-sms").check()
    await f.locator("#rg-whatsapp").check()
    await f.locator("#rg-repas").check()
    await f.locator("#rg-seuil").fill("1000")
    await f.getByRole("button", { name: "Enregistrer les réglages" }).click()
    await attendre(async () => {
      const r = await db.parametresNotification.findUnique({ where: { etablissementId: IA.id } })
      return !!r && r.sms && r.whatsapp && r.email && r.repasServi && r.seuilSoldeBas === 1000
    }, "réglages enregistrés")
  })

  await etape("Message de test : validations puis envoi réel sur les trois canaux", async () => {
    await ouvrir(mgr, "/parametres/notifications", "notifications-page")
    const f = mgr.locator('[data-testid="form-test"]:visible')
    const tester = async (canal, dest) => {
      await f.locator("#nt-canal").selectOption(canal)
      await f.locator("#nt-dest").fill(dest)
      await f.getByRole("button", { name: "Envoyer le message test" }).click()
    }
    await tester("EMAIL", "pasunemail")
    await f.getByText("Adresse e-mail invalide.").waitFor()
    await tester("SMS", "123")
    await f.getByText("Numéro invalide").waitFor()
    verifier(recus.length === 0, "rien envoyé avec des destinataires invalides")
    await tester("EMAIL", "test@zz-nt.test")
    await recoit((m) => m.canal === "EMAIL" && m.to === "test@zz-nt.test", "e-mail de test reçu")
    await sleep(800)
    await tester("SMS", "07 07 07 07 07")
    await recoit((m) => m.canal === "SMS" && m.to === "+2250707070707", "SMS de test normalisé en +225")
    await sleep(800)
    await tester("WHATSAPP", "+2250102030405")
    await recoit((m) => m.canal === "WHATSAPP" && m.to === "+2250102030405", "WhatsApp de test reçu")
    await attendre(async () => (await db.notification.count({ where: { etablissementId: IA.id, evenement: "TEST", statut: "SENT" } })) === 3, "trois tests marqués envoyés")
  })

  await etape("Relance de facture : le client est prévenu sur les trois canaux, une fois par niveau", async () => {
    const compta = await connecter(BASE, COMPTA, mdpCompta)
    await ouvrir(compta, "/facturation/" + facture.id, "facture-detail")
    const relancer = async (n) => {
      await compta.locator("#rel-note:visible").fill("Appel " + n)
      await compta.getByRole("button", { name: "Enregistrer la relance" }).click()
      await attendre(async () => (await db.relance.count({ where: { factureId: facture.id } })) === n, "relance n°" + n)
    }
    await relancer(1)
    const r1 = (m) => m.message.includes("FAC-00001") && m.message.includes("rappel n°1")
    await recoit(r1, "trois messages de relance n°1", 3)
    verifier(["+2250708091011", "client@zz-nt.test"].every((t) => recus.some((m) => r1(m) && m.to === t)), "relance reçue au téléphone et à l'e-mail du client")
    verifier(nb(r1) === 3, "exactement trois messages pour le niveau 1")
    await sleep(800)
    await relancer(2)
    await recoit((m) => m.message.includes("rappel n°2"), "trois messages de relance n°2", 3)
    await attendre(async () => (await db.notification.count({ where: { etablissementId: IA.id, evenement: "RELANCE", statut: "SENT" } })) === 6, "six relances journalisées")
  })

  await etape("Recharge et service : tuteur prévenu de la recharge, du repas et du solde bas", async () => {
    const caisse = await connecter(BASE, CAISSE, mdpCaisse)
    await caisse.goto(BASE + "/paiements", { waitUntil: "load" })
    await caisse.locator('[data-testid="form-recharge"]:visible').waitFor()
    await sleep(300)
    const f = caisse.locator('[data-testid="form-recharge"]:visible')
    await f.locator("#rc-matricule").fill("ZZN-1")
    await f.locator("#rc-montant").fill("2000")
    await f.locator("#rc-methode").selectOption("CASH")
    await f.getByRole("button", { name: "Enregistrer la recharge" }).click()
    await attendre(async () => Number((await db.inscrit.findUnique({ where: { id: ins.id } })).solde) === 3500, "solde 3500 après recharge")
    await recoit((m) => m.message.includes("recharge de") && m.message.includes("Nouveau solde"), "trois messages de recharge", 3)
    verifier(["+2250102030405", "parent@zz-nt.test"].every((t) => recus.some((m) => m.message.includes("recharge de") && m.to === t)), "recharge reçue par le tuteur")

    await db.inscrit.update({ where: { id: ins.id }, data: { solde: 1200 } })
    await caisse.goto(BASE + "/service?service=LUNCH", { waitUntil: "load" })
    await caisse.locator('[data-testid="service-page"]:visible').waitFor()
    await sleep(300)
    await caisse.locator("#scan-code:visible").fill("ZZN-1")
    await caisse.getByRole("button", { name: "Valider" }).click()
    await caisse.locator('[data-testid="resultat-scan"][data-statut="SERVI"]:visible').waitFor()
    await recoit((m) => m.message.includes("a pris son repas"), "trois messages « repas servi »", 3)
    await recoit((m) => m.message.includes("Pensez à recharger"), "trois messages « solde bas »", 3)
    await sleep(1500)
    verifier(nb((m) => m.message.includes("a pris son repas")) === 3 && nb((m) => m.message.includes("Pensez à recharger")) === 3, "aucun doublon d'envoi")
  })

  await etape("Échec d'envoi : message en échec conservé puis repris sans doublon", async () => {
    await ouvrir(mgr, "/parametres/notifications", "notifications-page")
    const f = mgr.locator('[data-testid="form-test"]:visible')
    echec = true
    await f.locator("#nt-canal").selectOption("EMAIL")
    await f.locator("#nt-dest").fill("retry@zz-nt.test")
    await f.getByRole("button", { name: "Envoyer le message test" }).click()
    await f.getByText("Échec d'envoi").waitFor()
    const n = await db.notification.findFirst({ where: { etablissementId: IA.id, destinataire: "retry@zz-nt.test" } })
    verifier(n && n.statut === "FAILED" && n.tentatives === 1 && !!n.erreur, "message en échec conservé avec son erreur")
    echec = false
    await ouvrir(mgr, "/parametres/notifications", "notifications-page")
    await mgr.locator('[data-testid="reprise"]:visible').getByRole("button", { name: "Réessayer les échecs" }).click()
    await attendre(async () => (await db.notification.findUnique({ where: { id: n.id } })).statut === "SENT", "message repris puis envoyé")
    await sleep(800)
    verifier(nb((m) => m.to === "retry@zz-nt.test") === 1, "un seul envoi réussi pour ce message")
  })

  await etape("Alerte stock : le personnel est prévenu par e-mail quand un ingrédient passe sous le seuil", async () => {
    const poulet = await db.ingredient.create({ data: { etablissementId: IA.id, name: "ZZ Poulet NT", unit: "kg", stock: 10, seuil: 8 } })
    await db.lot.create({ data: { etablissementId: IA.id, ingredientId: poulet.id, reference: "L-NT", quantite: 10, restante: 10, prix: 100 } })
    const magasin = await connecter(BASE, MAGASIN, mdpMagasin)
    await ouvrir(magasin, "/stock", "stock-page")
    const a = magasin.locator('[data-testid="form-ajustement-stock"]:visible')
    await a.locator("#aj-ingredient").selectOption({ label: "ZZ Poulet NT (kg)" })
    await a.locator("#aj-type").selectOption("PERTE")
    await a.locator("#aj-quantite").fill("5")
    await a.locator("#aj-note").fill("Casse")
    await a.getByRole("button", { name: "Enregistrer" }).click()
    await attendre(async () => Number((await db.ingredient.findUnique({ where: { id: poulet.id } })).stock) === 5, "perte enregistrée")
    const alerte = (m) => m.canal === "EMAIL" && m.message.includes("ZZ Poulet NT")
    await recoit(alerte, "alerte stock reçue par les deux responsables", 2)
    await sleep(1200)
    const destinataires = recus.filter(alerte).map((m) => m.to).sort()
    verifier(JSON.stringify(destinataires) === JSON.stringify([MAGASIN, MGR].sort()), "alerte envoyée au responsable et au magasinier seulement : " + destinataires.join(", "))
  })

  await etape("Appel planifié, isolation, droits et audit", async () => {
    const appel = (secretEnvoye) => fetch(BASE + "/api/notifications/traiter", { method: "POST", headers: secretEnvoye ? { "x-cron-secret": secretEnvoye } : {} })
    verifier((await appel(null)).status === 401, "appel sans secret refusé")
    verifier((await appel("mauvais-secret-0123456789")).status === 401, "mauvais secret refusé")
    const ok = await appel(CRON)
    verifier(ok.status === 200 && typeof (await ok.json()).traites === "number", "appel avec le bon secret accepté")

    const autre = await connecter(BASE, AUTRE, mdpAutre)
    await ouvrir(autre, "/parametres/notifications", "notifications-page")
    verifier((await autre.locator('[data-testid="journal"] tr[data-evenement]').count()) === 0, "autre établissement : aucun message visible")

    await ouvrir(mgr, "/parametres/notifications", "notifications-page")
    verifier((await mgr.locator('[data-testid="journal"] tr[data-evenement="RELANCE"][data-statut="SENT"]').count()) === 6, "journal : six relances envoyées")
    for (const action of ["NOTIF_REGLAGES", "NOTIF_TEST", "NOTIF_REESSAI"]) {
      verifier((await db.auditLog.count({ where: { action, userEmail: { in: EMAILS } } })) > 0, "audit manquant : " + action)
    }
  })

  await terminer(nettoyer, "NOTIFICATIONS", 0)
}

principal().catch(async (e) => {
  console.error("Echec : " + (e && e.message ? e.message : e))
  await terminer(nettoyer, "NOTIFICATIONS", 1)
})