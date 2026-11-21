import "dotenv/config"
import { randomBytes } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"

import { PrismaPg } from "@prisma/adapter-pg"
import * as bcryptModule from "bcryptjs"
import Redis from "ioredis"
import { chromium } from "playwright"

import { PrismaClient } from "../src/generated/prisma/client.ts"
import { hacher } from "../src/lib/api-cle.ts"

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

const PORT = 3127
const BASE = "http://localhost:" + PORT
const mdpAdmin = secret()
const mdpGest = secret()
const mdpCompta = secret()
const mdpChef = secret()
const ADMIN = "test-pi-admin@miam.test"
const GEST = "test-pi-gest@miam.test"
const COMPTA = "test-pi-compta@miam.test"
const CHEF = "test-pi-chef@miam.test"
const EMAILS = [ADMIN, GEST, COMPTA, CHEF]
const iso = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)
const dateDb = (s) => new Date(s + "T00:00:00.000Z")

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: { in: EMAILS } } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-PI", name: "ZZ Cantine Pilotage", type: "SCHOOL", prepaye: true } })
  const E2 = await db.etablissement.create({ data: { code: "ZZ-PJ", name: "ZZ Autre Pilotage", type: "SCHOOL", prepaye: true } })
  const creerUser = (email, name, role, mdp) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  await creerUser(ADMIN, "Test Pi Admin", "ADMIN", mdpAdmin)
  await creerUser(GEST, "Test Pi Gest", "MANAGER", mdpGest)
  await creerUser(COMPTA, "Test Pi Compta", "ACCOUNTANT", mdpCompta)
  await creerUser(CHEF, "Test Pi Chef", "CHEF", mdpChef)

  // Donnees controlees de l'etablissement E
  const c1 = await db.consommation.create({ data: { etablissementId: E.id, date: dateDb(iso(-2)), service: "LUNCH", repas: 100 } })
  await db.consommation.create({ data: { etablissementId: E.id, date: dateDb(iso(-1)), service: "LUNCH", repas: 120 } })
  await db.consommation.create({ data: { etablissementId: E.id, date: dateDb(iso(0)), service: "SNACK", repas: 80 } })
  const sucre = await db.ingredient.create({ data: { etablissementId: E.id, name: "ZZ Sucre", unit: "kg", unitCost: 500, stock: 2, seuil: 10 } })
  await db.ingredient.create({ data: { etablissementId: E.id, name: "ZZ Sel", unit: "kg", unitCost: 200, stock: 50, seuil: 5 } })
  await db.lot.create({ data: { etablissementId: E.id, ingredientId: sucre.id, reference: "ZZ-PI-LOT", quantite: 5, restante: 5, prix: 500, peremption: dateDb(iso(3)) } })
  await db.mouvementStock.create({ data: { etablissementId: E.id, ingredientId: sucre.id, type: "SORTIE", quantite: -10, prix: 500, consommationId: c1.id } })
  for (const note of [5, 4, 3]) await db.avis.create({ data: { etablissementId: E.id, date: dateDb(iso(0)), service: "LUNCH", note, source: "PARENT" } })
  const frigo = await db.equipement.create({ data: { etablissementId: E.id, nom: "ZZ Frigo", type: "REFRIGERATEUR", tempMin: 0, tempMax: 4 } })
  for (const [valeur, conforme] of [[2, true], [3, true], [4, true], [9, false]]) await db.releveTemperature.create({ data: { etablissementId: E.id, equipementId: frigo.id, valeur, conforme } })
  await db.nonConformite.create({ data: { etablissementId: E.id, titre: "ZZ NC critique", gravite: "CRITIQUE", statut: "OUVERTE" } })
  await db.tacheHygiene.create({ data: { etablissementId: E.id, nom: "ZZ Tache du jour", frequence: "QUOTIDIENNE" } })
  await db.suggestion.create({ data: { etablissementId: E.id, titre: "ZZ Suggestion", statut: "NOUVELLE" } })
  const platMenu = await db.plat.create({ data: { etablissementId: E.id, name: "ZZ Plat Menu" } })
  await db.menu.create({ data: { etablissementId: E.id, date: dateDb(iso(1)), service: "LUNCH", statut: "PUBLISHED", plats: { create: [{ platId: platMenu.id }] } } })
  await db.menu.create({ data: { etablissementId: E.id, date: dateDb(iso(2)), service: "LUNCH", statut: "DRAFT", plats: { create: [{ platId: platMenu.id }] } } })
  // Donnees de l'etablissement E2 : ne doivent jamais apparaitre cote E
  await db.consommation.create({ data: { etablissementId: E2.id, date: dateDb(iso(-1)), service: "LUNCH", repas: 999 } })
  await db.nonConformite.create({ data: { etablissementId: E2.id, titre: "ZZ NC autre", gravite: "CRITIQUE", statut: "OUVERTE" } })
  await db.objectifKpi.create({ data: { etablissementId: E2.id, kpi: "repas_servis", cible: 5, sens: "MAX" } })
  const platAutre = await db.plat.create({ data: { etablissementId: E2.id, name: "ZZ Plat Autre Menu" } })
  await db.menu.create({ data: { etablissementId: E2.id, date: dateDb(iso(1)), service: "LUNCH", statut: "PUBLISHED", plats: { create: [{ platId: platAutre.id }] } } })

  process.env.CRON_SECRET = secret() + secret()
  process.env.API_LIMITE_MINUTE = "12"
  await demarrer(BASE, PORT)
  const admin = await connecter(BASE, ADMIN, mdpAdmin)
  await admin.context().addCookies([{ name: "miam_etab", value: E.id, url: BASE }])
  const gest = await connecter(BASE, GEST, mdpGest)
  const compta = await connecter(BASE, COMPTA, mdpCompta)
  const chef = await connecter(BASE, CHEF, mdpChef)
  const texte = (p, t) => p.getByText(t).filter({ visible: true }).first()
  const aller = async (p, chemin, testid) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
  }
  const valeurKpi = async (p, id) => (await p.locator('[data-kpi="' + id + '"] [data-valeur]').first().innerText()).replace(/\s+/g, " ").trim()
  const objectif = async (p, o) => {
    const f = p.locator('[data-testid="form-objectif"]:visible')
    await f.locator("#ob-kpi").selectOption(o.kpi ?? "")
    await f.locator("#ob-cible").fill(o.cible ?? "")
    await f.getByRole("button", { name: "Enregistrer l'objectif" }).click()
  }
  const api = (chemin, cle) => fetch(BASE + chemin, { headers: cle ? { Authorization: "Bearer " + cle } : {} })

  await etape("Accès : admin, direction et comptabilité voient le pilotage ; la cuisine n'a ni la page ni l'entrée de menu", async () => {
    for (const p of [admin, gest, compta]) {
      await aller(p, "/pilotage", "pilotage-page")
      verifier((await p.locator('[data-testid="menu-principal"] a[href="/pilotage"]').count()) >= 1, "entrée de menu Pilotage")
    }
    await aller(chef, "/pilotage", "acces-refuse")
    verifier((await chef.locator('[data-testid="pilotage-page"]').count()) === 0, "la cuisine n'accède pas à la page")
    verifier((await chef.locator('[data-testid="menu-principal"] a[href="/pilotage"]').count()) === 0, "pas d'entrée de menu pour la cuisine")
    verifier((await admin.locator('a[href="/pilotage?vue=api"]').count()) >= 1, "l'admin voit l'onglet des clés d'API")
    verifier((await gest.locator('a[href="/pilotage?vue=api"]').count()) === 0, "la direction ne voit pas l'onglet des clés d'API")
  })

  await etape("Tableau de bord : indicateurs calculés sur les données de l'établissement seulement", async () => {
    await aller(gest, "/pilotage?vue=tableau", "tableau-kpis")
    const att = [["repas_servis", "300"], ["cout_repas", "17"], ["satisfaction", "4,0"], ["conformite_temperatures", "75 %"], ["nc_ouvertes", "1"], ["stock_critique", "1"], ["factures_retard", "0"]]
    for (const [id, attendu] of att) {
      const v = await valeurKpi(gest, id)
      verifier(v.includes(attendu), id + " attendu " + attendu + " obtenu " + v)
    }
    verifier(!(await valeurKpi(gest, "repas_servis")).includes("999"), "les repas de l'autre établissement ne sont pas comptés")
    verifier((await gest.locator('[data-kpi="repas_servis"]').innerText()).includes("Aucun objectif défini"), "l'objectif de l'autre établissement n'apparaît pas")
  })

  await etape("Alertes : les cinq alertes attendues, la plus grave en premier, rien d'inventé", async () => {
    await aller(compta, "/pilotage?vue=alertes", "liste-alertes")
    for (const code of ["STOCK_BAS", "LOTS_PEREMPTION", "NC_OUVERTES", "HYGIENE_A_FAIRE", "SUGGESTIONS_NOUVELLES"]) {
      verifier((await compta.locator('[data-alerte="' + code + '"]').count()) === 1, "alerte " + code)
    }
    for (const code of ["FACTURES_RETARD", "CONGES_ATTENTE", "TEMOINS_A_JETER", "SOLDES_NEGATIFS"]) {
      verifier((await compta.locator('[data-alerte="' + code + '"]').count()) === 0, "pas d'alerte " + code)
    }
    verifier((await compta.locator("[data-alerte]").first().getAttribute("data-alerte")) === "NC_OUVERTES", "l'alerte critique est la première")
    verifier((await compta.locator('[data-alerte="NC_OUVERTES"]').innerText()).includes("1 ouverte(s), dont 1 critique(s)"), "détail de l'alerte")
  })

  await etape("Objectifs : saisies invalides refusées, statuts, remplacement sans doublon, retrait, lecture seule pour la comptabilité", async () => {
    await aller(gest, "/pilotage?vue=objectifs", "table-objectifs")
    await objectif(gest, { kpi: "", cible: "5" })
    await texte(gest, "Choisissez un indicateur").waitFor()
    await objectif(gest, { kpi: "nc_ouvertes", cible: "abc" })
    await texte(gest, "Cible invalide").waitFor()
    await objectif(gest, { kpi: "nc_ouvertes", cible: "0" })
    await texte(gest, "Objectif enregistré : Non-conformités ouvertes.").waitFor()
    await objectif(gest, { kpi: "satisfaction", cible: "4" })
    await texte(gest, "Objectif enregistré : Satisfaction moyenne (30 jours).").waitFor()
    await objectif(gest, { kpi: "repas_servis", cible: "320" })
    await texte(gest, "Objectif enregistré : Repas servis (30 jours).").waitFor()
    const lire = async (id) => (await gest.locator('[data-objectif="' + id + '"]').innerText()).replace(/\s+/g, " ")
    verifier((await lire("nc_ouvertes")).includes("À améliorer"), "nc_ouvertes : écart")
    verifier((await lire("satisfaction")).includes("Atteint"), "satisfaction : atteint")
    verifier((await lire("repas_servis")).includes("Proche"), "repas servis : proche")
    await objectif(gest, { kpi: "satisfaction", cible: "4.3" })
    await attendre(async () => (await lire("satisfaction")).includes("Proche"), "objectif remplacé par 4,3")
    verifier((await db.objectifKpi.count({ where: { etablissementId: E.id, kpi: "satisfaction" } })) === 1, "pas de doublon d'objectif")
    await gest.locator('[data-objectif="repas_servis"]').getByRole("button", { name: "Retirer" }).click()
    await attendre(async () => (await db.objectifKpi.count({ where: { etablissementId: E.id, kpi: "repas_servis" } })) === 0, "objectif retiré")
    verifier((await db.objectifKpi.count({ where: { etablissementId: E2.id } })) === 1, "l'objectif de l'autre établissement est intact")
    await aller(compta, "/pilotage?vue=objectifs", "table-objectifs")
    verifier((await compta.locator('[data-testid="form-objectif"]').count()) === 0, "la comptabilité ne définit pas d'objectif")
    verifier((await compta.getByRole("button", { name: "Retirer" }).count()) === 0, "la comptabilité ne retire rien")
    await aller(compta, "/pilotage?vue=tableau", "tableau-kpis")
    verifier((await compta.locator('[data-kpi="nc_ouvertes"]').innerText()).includes("À améliorer"), "objectif visible sur le tableau de bord")
  })

  let cle = ""
  await etape("Clés d'API : création validée, clé affichée une fois, seule l'empreinte est stockée, endpoints en lecture seule isolés", async () => {
    await aller(gest, "/pilotage?vue=api", "pilotage-page")
    verifier((await gest.locator('[data-testid="form-cle"]').count()) === 0, "la direction ne gère pas les clés d'API")
    await aller(admin, "/pilotage?vue=api", "form-cle")
    const f = admin.locator('[data-testid="form-cle"]:visible')
    await f.locator("#cl-nom").fill("ab")
    await f.getByRole("button", { name: "Créer la clé" }).click()
    await texte(admin, "Nom invalide").waitFor()
    await f.locator("#cl-nom").fill("ZZ Integration")
    await f.getByRole("button", { name: "Créer la clé" }).click()
    await admin.locator('[data-testid="cle-creee"]:visible').waitFor()
    const message = await admin.locator('[data-testid="cle-creee"]').first().innerText()
    const m = /miam_[0-9a-f]{8}_[0-9a-f]{32}/.exec(message)
    verifier(m, "la clé est affichée à la création : " + message)
    cle = m[0]
    const nbCles = await db.cleApi.count({ where: { etablissementId: E.id, nom: "ZZ Integration" } })
    const enBase = await db.cleApi.findUnique({ where: { prefixe: cle.split("_")[1] } })
    verifier(enBase && enBase.hash === hacher(cle) && enBase.hash !== cle && enBase.hash.length === 64, "seule l'empreinte est stockée : " + JSON.stringify({ nbCles, trouve: !!enBase, concorde: !!enBase && enBase.hash === hacher(cle), longueur: enBase ? enBase.hash.length : null, cle, hashStocke: enBase ? enBase.hash : null, hashAttendu: hacher(cle), message }))
    verifier(nbCles === 1, "une seule clé créée par clic, trouvé " + nbCles)
    verifier(!JSON.stringify(enBase).includes(cle), "la clé n'apparaît nulle part en base")
    await aller(admin, "/pilotage?vue=api", "table-cles")
    verifier(!(await admin.locator("body").innerText()).includes(cle), "la clé n'est plus jamais réaffichée")

    verifier((await api("/api/v1/etablissement")).status === 401, "sans clé : 401")
    verifier((await api("/api/v1/etablissement", "n'importe quoi")).status === 401, "clé mal formée : 401")
    verifier((await api("/api/v1/etablissement", "miam_00000000_" + "0".repeat(32))).status === 401, "clé inconnue : 401")
    verifier((await api("/api/v1/etablissement", cle.slice(0, -1) + (cle.endsWith("0") ? "1" : "0"))).status === 401, "clé altérée : 401")

    const reponseEtab = await api("/api/v1/etablissement", cle)
    const corpsEtab = await reponseEtab.text()
    let e = {}
    try { e = JSON.parse(corpsEtab) } catch { e = {} }
    verifier(e.code === "ZZ-PI", "établissement de la clé : statut " + reponseEtab.status + " corps " + corpsEtab)
    const k = await (await api("/api/v1/kpis", cle)).json()
    const kv = (id) => k.kpis.find((x) => x.id === id)
    verifier(kv("nc_ouvertes").valeur === 1 && kv("stock_critique").valeur === 1, "indicateurs via l'API")
    verifier(kv("nc_ouvertes").cible === 0 && kv("nc_ouvertes").statut === "ECART", "objectifs via l'API")
    const al = await (await api("/api/v1/alertes", cle)).json()
    verifier(al.alertes.some((x) => x.code === "NC_OUVERTES" && x.gravite === "CRITIQUE"), "alertes via l'API")
    const fq = await (await api("/api/v1/frequentation?jours=7", cle)).json()
    verifier(fq.frequentation.reduce((s, x) => s + x.repas, 0) === 300, "fréquentation : 300 repas, sans l'autre établissement")
    verifier((await api("/api/v1/frequentation?jours=0", cle)).status === 400, "jours invalide : 400")
    const mn = await (await api("/api/v1/menus?du=" + iso(0) + "&au=" + iso(3), cle)).json()
    verifier(mn.menus.length === 1 && mn.menus[0].plats.join() === "ZZ Plat Menu", "seul le menu publié de l'établissement est exposé")
    verifier((await api("/api/v1/menus?du=2026-13-45", cle)).status === 400, "dates invalides : 400")
    verifier((await api("/api/v1/menus?du=" + iso(0) + "&au=" + iso(60), cle)).status === 400, "période trop longue : 400")
    const post = await fetch(BASE + "/api/v1/kpis", { method: "POST", headers: { Authorization: "Bearer " + cle } })
    verifier(post.status === 405, "lecture seule : POST refusé, statut " + post.status)
    await attendre(async () => (await db.cleApi.findUnique({ where: { id: enBase.id } }))?.derniereUtilisation !== null, "dernière utilisation enregistrée")
  })

  await etape("Limite de débit, révocation immédiate et traçabilité", async () => {
    let limite = null
    for (let i = 0; i < 30; i++) {
      const r = await api("/api/v1/etablissement", cle)
      if (r.status === 429) {
        limite = r
        break
      }
      verifier(r.status === 200, "appel normal avant la limite, statut " + r.status)
    }
    verifier(limite && Number(limite.headers.get("retry-after")) > 0, "429 avec Retry-After")
    await aller(admin, "/pilotage?vue=api", "table-cles")
    const ligne = admin.locator('[data-cle="ZZ Integration"]')
    verifier((await ligne.innerText()).includes("Active"), "clé active")
    await ligne.getByRole("button", { name: "Révoquer" }).click()
    await attendre(async () => (await db.cleApi.findFirst({ where: { etablissementId: E.id, nom: "ZZ Integration" } }))?.actif === false, "clé révoquée en base")
    const rev = await db.cleApi.findFirst({ where: { etablissementId: E.id, nom: "ZZ Integration" } })
    verifier(rev.revoqueeLe !== null, "date de révocation")
    await attendre(async () => (await ligne.innerText()).includes("Révoquée"), "clé affichée comme révoquée")
    verifier((await api("/api/v1/etablissement", cle)).status === 401, "clé révoquée : refus immédiat")
    const compte = (email, action) => db.auditLog.count({ where: { userEmail: email, action } })
    verifier((await compte(ADMIN, "CLE_API_CREEE")) >= 1, "audit de création de clé")
    verifier((await compte(ADMIN, "CLE_API_REVOQUEE")) >= 1, "audit de révocation")
    verifier((await compte(GEST, "OBJECTIF_DEFINI")) >= 4, "audit des objectifs")
    verifier((await compte(GEST, "OBJECTIF_SUPPRIME")) >= 1, "audit du retrait")
    const journal = await db.auditLog.findMany({ where: { action: { in: ["CLE_API_CREEE", "CLE_API_REVOQUEE"] }, userEmail: ADMIN } })
    verifier(!JSON.stringify(journal).includes(cle), "la clé n'est jamais écrite dans le journal")
    const r = await fetch(BASE + "/pilotage", { redirect: "manual" })
    verifier([301, 302, 303, 307, 308].includes(r.status), "accès anonyme à la page redirigé, statut " + r.status)
  })
}

principal()
  .then(() => terminer(nettoyer, "PILOTAGE", 0))
  .catch((e) => {
    console.log("ERREUR : " + e.message)
    return terminer(nettoyer, "PILOTAGE", 1)
  })