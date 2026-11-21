import "dotenv/config"
import { randomBytes } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"
import { deflateSync } from "node:zlib"

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
  const p = await (await navigateur.newContext({ locale: "fr-FR", viewport: { width: 1440, height: 2200 } })).newPage()
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

// Petite image PNG valide, fabriquee sans dependance.
function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}
function morceau(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const t = Buffer.from(type, "ascii")
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, c])
}
function png(w, h, rgb) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const ligne = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())])
  const brut = Buffer.concat(Array.from({ length: h }, () => ligne))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), morceau("IHDR", ihdr), morceau("IDAT", deflateSync(brut)), morceau("IEND", Buffer.alloc(0))])
}

const PORT = 3130
const BASE = "http://localhost:" + PORT
const mdpCais = secret()
const mdpGest = secret()
const mdpAutre = secret()
const CAIS = "test-cs-cais@miam.test"
const GEST = "test-cs-gest@miam.test"
const AUTRE = "test-cs-autre@miam.test"
const EMAILS = [CAIS, GEST, AUTRE]

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: { in: EMAILS } } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-CS", name: "ZZ Cantine Caisse", type: "SCHOOL", prepaye: true } })
  const E2 = await db.etablissement.create({ data: { code: "ZZ-CX", name: "ZZ Autre Caisse", type: "SCHOOL", prepaye: true } })
  const creerUser = (email, name, role, mdp, etab) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: etab.id }] } } })
  await creerUser(CAIS, "Test Cs Cais", "CASHIER", mdpCais, E)
  await creerUser(GEST, "Test Cs Gest", "MANAGER", mdpGest, E)
  await creerUser(AUTRE, "Test Cs Autre", "MANAGER", mdpAutre, E2)
  await db.articleCarte.create({ data: { etablissementId: E.id, nom: "ZZ Jus", prix: 500, categorie: "Boissons" } })
  await db.articleCarte.create({ data: { etablissementId: E.id, nom: "ZZ Pain", prix: 250, categorie: "Snacks" } })

  await demarrer(BASE, PORT)
  const cais = await connecter(BASE, CAIS, mdpCais)
  const gest = await connecter(BASE, GEST, mdpGest)
  const autre = await connecter(BASE, AUTRE, mdpAutre)
  const aller = async (p, chemin, testid) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
  }
  const article = (p, nom) => p.locator('[data-article="' + nom + '"]:visible')
  const mode = (p, m) => p.locator('[data-mode="' + m + '"]:visible').click()
  const encaisser = (p) => p.getByRole("button", { name: "Encaisser" }).click()
  const resultat = (p, n) => p.locator('[data-testid="caisse-resultat"][data-numero="' + n + '"]').waitFor()
  const vente = (numero) => db.venteComptoir.findFirst({ where: { etablissementId: E.id, numero } })
  const session1 = () => db.sessionCaisse.findFirst({ where: { etablissementId: E.id, numero: 1 } })
  const ligneArticle = (p, nom) => p.locator('[data-article-ligne="' + nom + '"]')
  const imageArticle = async () => (await db.articleCarte.findFirst({ where: { etablissementId: E.id, nom: "ZZ Jus" } })).imageId

  await etape("Ouverture obligatoire : refus sans caisse ouverte, puis ouverture avec fond", async () => {
    await aller(gest, "/caisse", "caisse-page")
    verifier((await gest.locator('[data-testid="obligation-etat"]').getAttribute("data-valeur")) === "non", "ouverture non obligatoire par défaut")
    await gest.getByRole("button", { name: "Exiger l'ouverture de la caisse" }).click()
    await attendre(async () => (await db.etablissement.findUnique({ where: { id: E.id } })).sessionCaisseObligatoire === true, "réglage activé")
    await aller(cais, "/caisse", "caisse-page")
    verifier((await cais.locator('[data-testid="rapport-caissiers"]').count()) === 0, "le caissier ne voit pas le rapport par caissier")
    verifier((await cais.locator('[data-testid="obligation-etat"]').count()) === 0, "le caissier ne règle pas l'obligation")
    await article(cais, "ZZ Jus").click()
    await mode(cais, "CASH")
    await encaisser(cais)
    await cais.locator('[data-testid="caisse-erreur"]:visible').filter({ hasText: "Ouvrez votre caisse" }).waitFor()
    verifier((await db.venteComptoir.count({ where: { etablissementId: E.id } })) === 0, "aucune vente sans caisse ouverte")
    await aller(cais, "/caisse", "caisse-page")
    await cais.locator("#oc-fond").fill("5000")
    await cais.getByRole("button", { name: "Ouvrir la caisse" }).click()
    const s = await attendre(session1, "session ouverte")
    verifier(s.statut === "OUVERTE" && s.fondInitial === 5000 && s.caissierEmail === CAIS, "session 1 ouverte avec un fond de 5000")
    await aller(cais, "/caisse", "caisse-page")
    await cais.locator('[data-testid="session-courante"][data-numero="1"]').waitFor()
  })

  await etape("Ventes : monnaie à rendre, reçu animé jusqu'à « prêt », rattachement à la caisse, ticket imprimable", async () => {
    await aller(cais, "/caisse", "caisse-page")
    await article(cais, "ZZ Jus").click()
    await article(cais, "ZZ Jus").click()
    await article(cais, "ZZ Pain").click()
    verifier((await cais.locator('[data-testid="panier-total"]').getAttribute("data-valeur")) === "1250", "total du panier 1250")
    await mode(cais, "CASH")
    await cais.locator("#ca-recu").fill("100")
    await encaisser(cais)
    await cais.locator('[data-testid="caisse-erreur"]:visible').filter({ hasText: "inférieur" }).waitFor()
    await cais.locator("#ca-recu").fill("2000")
    await cais.locator('[data-testid="rendu-apercu"][data-valeur="750"]').waitFor()
    await encaisser(cais)
    await resultat(cais, 1)
    const recu = cais.locator('[data-testid="recu-imprimante"][data-ticket="T-00001"]')
    await recu.waitFor()
    await attendre(async () => (await recu.getAttribute("data-etape")) === "pret", "fin de l'animation d'impression", 15000)
    verifier((await recu.locator("[data-recu-ligne]").count()) === 2, "deux lignes sur le reçu")
    verifier((await recu.locator('[data-recu-total="1250"]').count()) === 1 && (await recu.locator('[data-recu-rendu="750"]').count()) === 1, "total 1250 et rendu 750 sur le reçu")
    const v1 = await vente(1)
    const s = await session1()
    verifier(v1.sessionId === s.id && v1.recu === 2000 && v1.total === 1250 && v1.methode === "CASH", "vente 1 rattachée à la caisse avec le montant reçu")

    await article(cais, "ZZ Jus").click()
    await mode(cais, "MTN")
    await encaisser(cais)
    await resultat(cais, 2)
    await article(cais, "ZZ Pain").click()
    await mode(cais, "CASH")
    await encaisser(cais)
    await resultat(cais, 3)
    const v2 = await vente(2)
    const v3 = await vente(3)
    verifier(v2.methode === "MTN" && v2.total === 500 && v2.sessionId === s.id, "vente 2 Mobile Money rattachée")
    verifier(v3.methode === "CASH" && v3.total === 250 && v3.recu === null, "vente 3 en espèces sans montant reçu")

    const ticket = await cais.request.get(BASE + "/impression-ticket/1")
    const html = await ticket.text()
    verifier(ticket.status() === 200 && html.includes("T-00001") && html.includes('data-rendu="750"'), "ticket imprimable avec le rendu")
    const autreTicket = await autre.request.get(BASE + "/impression-ticket/1")
    verifier(!(await autreTicket.text()).includes('data-testid="ticket-imprime"'), "un autre établissement ne voit pas ce ticket")
  })

  await etape("Annulation, clôture avec écart, rapport Z, vente d'une caisse clôturée non annulable", async () => {
    await aller(gest, "/caisse", "caisse-page")
    await gest.locator('[data-vente][data-numero="3"]').getByRole("button", { name: "Annuler" }).click()
    await attendre(async () => (await vente(3)).statut === "ANNULEE", "vente 3 annulée")

    await aller(cais, "/caisse", "caisse-page")
    const ligne = cais.locator('[data-session="1"]')
    await ligne.locator('input[name="compte"]').fill("6200")
    await ligne.getByRole("button", { name: "Clôturer la caisse" }).click()
    const s = await attendre(async () => {
      const x = await session1()
      return x.statut === "CLOTUREE" ? x : null
    }, "caisse clôturée")
    verifier(s.especesAttendues === 6250 && s.especesComptees === 6200 && s.ecart === -50 && s.clotureePar === CAIS, "attendu 6250 (fond 5000 + espèces 1250), compté 6200, écart -50")

    await aller(cais, "/caisse", "caisse-page")
    const apres = cais.locator('[data-session="1"]')
    verifier((await apres.getAttribute("data-statut")) === "CLOTUREE" && (await apres.getAttribute("data-ecart")) === "-50" && (await apres.getAttribute("data-attendu")) === "6250", "ligne de caisse clôturée avec son écart")
    verifier((await apres.locator('[data-testid="form-cloture"]').count()) === 0, "plus de formulaire de clôture")

    await cais.goto(BASE + "/impression-caisse/" + s.id, { waitUntil: "load" })
    await cais.locator('[data-testid="z-rapport"]').waitFor()
    verifier((await cais.locator('[data-testid="z-ecart"]').getAttribute("data-valeur")) === "-50", "rapport Z : écart -50")
    verifier((await cais.locator('[data-testid="z-attendu"]').getAttribute("data-valeur")) === "6250", "rapport Z : attendu 6250")
    verifier((await cais.locator('[data-testid="z-total"]').getAttribute("data-valeur")) === "1750", "rapport Z : total encaissé 1750")
    verifier((await cais.locator('[data-mode-z="CASH"]').count()) === 1 && (await cais.locator('[data-mode-z="MTN"]').count()) === 1, "rapport Z : espèces et Mobile Money")
    const z = await autre.request.get(BASE + "/impression-caisse/" + s.id)
    verifier(!(await z.text()).includes('data-testid="z-rapport"'), "un autre établissement ne voit pas ce rapport")

    await aller(gest, "/caisse", "caisse-page")
    await gest.locator('[data-vente][data-numero="1"]').getByRole("button", { name: "Annuler" }).click()
    await sleep(2000)
    verifier((await vente(1)).statut === "PAYEE", "une vente d'une caisse clôturée ne peut plus être annulée")

    await aller(cais, "/caisse", "caisse-page")
    await article(cais, "ZZ Jus").click()
    await mode(cais, "CASH")
    await encaisser(cais)
    await cais.locator('[data-testid="caisse-erreur"]:visible').filter({ hasText: "Ouvrez votre caisse" }).waitFor()
  })

  await etape("Rapport par caissier : totaux, annulations, période invalide, réservé au gestionnaire", async () => {
    await aller(gest, "/caisse", "caisse-page")
    const r = gest.locator('[data-caissier="' + CAIS + '"]')
    await r.waitFor()
    verifier((await r.getAttribute("data-nb")) === "2" && (await r.getAttribute("data-total")) === "1750" && (await r.getAttribute("data-annulees")) === "1", "2 ventes, 1750 encaissés, 1 annulée")
    await gest.goto(BASE + "/caisse?du=2026-13-45&au=2026-13-46", { waitUntil: "load" })
    await gest.locator('[data-testid="rapport-erreur"]').waitFor()
  })

  await etape("Images des articles : import réduit, service protégé, remplacement sans reste, fichier refusé, retrait", async () => {
    await aller(gest, "/caisse", "caisse-page")
    await ligneArticle(gest, "ZZ Jus").locator('[data-testid="image-input"]').setInputFiles({ name: "jus.png", mimeType: "image/png", buffer: png(8, 8, [255, 0, 0]) })
    const premier = await attendre(imageArticle, "image enregistrée")
    const img = await db.image.findUnique({ where: { id: premier } })
    verifier(["image/webp", "image/jpeg"].includes(img.mime) && img.taille > 0 && img.taille <= 716800 && img.etablissementId === E.id, "image réduite, stockée pour l'établissement")

    await aller(cais, "/caisse", "caisse-page")
    const miniature = cais.locator('[data-article="ZZ Jus"] img')
    verifier((await miniature.count()) === 1, "l'image s'affiche sur le bouton de l'article")
    const src = await miniature.getAttribute("src")
    const rep = await cais.request.get(BASE + src)
    verifier(rep.status() === 200 && /^image\/(webp|jpeg)$/.test(rep.headers()["content-type"]) && rep.headers()["x-content-type-options"] === "nosniff", "image servie avec son type et nosniff")
    verifier((await fetch(BASE + src, { redirect: "manual" })).status !== 200, "image refusée sans connexion")
    verifier((await autre.request.get(BASE + src)).status() === 404, "image invisible pour un autre établissement")

    await aller(gest, "/caisse", "caisse-page")
    await ligneArticle(gest, "ZZ Jus").locator('[data-testid="image-input"]').setInputFiles({ name: "jus2.png", mimeType: "image/png", buffer: png(16, 16, [0, 0, 255]) })
    await attendre(async () => {
      const id = await imageArticle()
      return id && id !== premier
    }, "image remplacée")
    verifier((await db.image.count({ where: { etablissementId: E.id } })) === 1, "l'ancienne image est supprimée")

    await aller(gest, "/caisse", "caisse-page")
    const courant = await imageArticle()
    await ligneArticle(gest, "ZZ Jus").locator('[data-testid="image-input"]').setInputFiles({ name: "x.png", mimeType: "image/png", buffer: Buffer.from("ceci n'est pas une image") })
    await ligneArticle(gest, "ZZ Jus").locator('[data-testid="msg-erreur"]').filter({ hasText: "Image illisible" }).waitFor()
    verifier((await imageArticle()) === courant, "un fichier invalide ne change rien")

    await ligneArticle(gest, "ZZ Jus").getByRole("button", { name: "Retirer l'image" }).click()
    await attendre(async () => (await imageArticle()) === null, "image retirée")
    verifier((await db.image.count({ where: { etablissementId: E.id } })) === 0, "l'image retirée est supprimée de la base")
    const compte = (email, action) => db.auditLog.count({ where: { userEmail: email, action } })
    verifier((await compte(CAIS, "SESSION_OUVERTE")) >= 1 && (await compte(CAIS, "SESSION_CLOTUREE")) >= 1, "audit d'ouverture et de clôture")
    verifier((await compte(GEST, "CAISSE_OBLIGATION")) >= 1 && (await compte(GEST, "ARTICLE_IMAGE")) >= 2 && (await compte(GEST, "ARTICLE_IMAGE_RETIREE")) >= 1, "audit du réglage et des images")
  })
}

principal()
  .then(() => terminer(nettoyer, "CAISSE SESSIONS", 0))
  .catch((e) => {
    console.log("ERREUR : " + e.message)
    return terminer(nettoyer, "CAISSE SESSIONS", 1)
  })