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

const PORT = 3126
const BASE = "http://localhost:" + PORT
const mdpGest = secret()
const mdpChef = secret()
const mdpMag = secret()
const mdpRh = secret()
const GEST = "test-ha-gest@miam.test"
const CHEF = "test-ha-chef@miam.test"
const MAG = "test-ha-mag@miam.test"
const RH = "test-ha-rh@miam.test"
const EMAILS = [GEST, CHEF, MAG, RH]
const iso = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)
const fr = (s) => s.split("-").reverse().join("/")
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
  const E = await db.etablissement.create({ data: { code: "ZZ-HA", name: "ZZ Cantine Hygiene", type: "SCHOOL", prepaye: true } })
  const E2 = await db.etablissement.create({ data: { code: "ZZ-HB", name: "ZZ Autre Hygiene", type: "SCHOOL", prepaye: true } })
  const creerUser = (email, name, role, mdp) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  await creerUser(GEST, "Test Ha Gest", "MANAGER", mdpGest)
  await creerUser(CHEF, "Test Ha Chef", "CHEF", mdpChef)
  await creerUser(MAG, "Test Ha Mag", "STOREKEEPER", mdpMag)
  await creerUser(RH, "Test Ha Rh", "HR", mdpRh)

  await db.nonConformite.create({ data: { etablissementId: E2.id, titre: "ZZ NC autre etablissement", gravite: "MINEURE" } })
  // Donnees de tracabilite : un lot utilise dans deux services, un lot d'un autre etablissement
  const farine = await db.ingredient.create({ data: { etablissementId: E.id, name: "ZZ Farine", unit: "kg", unitCost: 600 } })
  const lot1 = await db.lot.create({ data: { etablissementId: E.id, ingredientId: farine.id, reference: "ZZ-LOT-001", quantite: 50, restante: 20, prix: 600, peremption: dateDb(iso(30)) } })
  const farine2 = await db.ingredient.create({ data: { etablissementId: E2.id, name: "ZZ Farine Autre", unit: "kg", unitCost: 600 } })
  await db.lot.create({ data: { etablissementId: E2.id, ingredientId: farine2.id, reference: "ZZ-LOT-002", quantite: 10, restante: 10, prix: 600 } })
  const c1 = await db.consommation.create({ data: { etablissementId: E.id, date: dateDb(iso(-2)), service: "LUNCH", repas: 100 } })
  const c2 = await db.consommation.create({ data: { etablissementId: E.id, date: dateDb(iso(-1)), service: "LUNCH", repas: 120 } })
  for (const c of [c1, c2]) await db.mouvementStock.create({ data: { etablissementId: E.id, ingredientId: farine.id, lotId: lot1.id, type: "SORTIE", quantite: -15, consommationId: c.id } })
  // Un echantillon deja expire
  const vieux = await db.echantillonTemoin.create({ data: { etablissementId: E.id, date: dateDb(iso(-8)), service: "LUNCH", platNom: "ZZ Plat ancien", conserveJusqu: dateDb(iso(-3)) } })

  process.env.CRON_SECRET = secret() + secret()
  await demarrer(BASE, PORT)
  const gest = await connecter(BASE, GEST, mdpGest)
  const chef = await connecter(BASE, CHEF, mdpChef)
  const mag = await connecter(BASE, MAG, mdpMag)
  const rh = await connecter(BASE, RH, mdpRh)
  const texte = (p, t) => p.getByText(t).filter({ visible: true }).first()
  const aller = async (p, chemin, testid) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
  }
  const valeurKpi = (p, nom) => p.locator('[data-kpi="' + nom + '"] p').nth(1).innerText()
  const creerEq = async (p, o) => {
    const f = p.locator('[data-testid="form-equipement"]:visible')
    await f.locator("#eq-nom").fill(o.nom ?? "")
    await f.locator("#eq-type").selectOption(o.type ?? "REFRIGERATEUR")
    await f.locator("#eq-min").fill(o.min ?? "")
    await f.locator("#eq-max").fill(o.max ?? "")
    await f.getByRole("button", { name: "Ajouter l'équipement" }).click()
  }
  const releve = async (p, o) => {
    const f = p.locator('[data-testid="form-releve"]:visible')
    await f.locator("#rl-equipement").selectOption(o.eq ?? "")
    await f.locator("#rl-valeur").fill(o.valeur ?? "")
    await f.locator("#rl-action").fill(o.action ?? "")
    await f.getByRole("button", { name: "Enregistrer le relevé" }).click()
  }
  const creerTache = async (p, o) => {
    const f = p.locator('[data-testid="form-tache"]:visible')
    await f.locator("#tc-nom").fill(o.nom ?? "")
    await f.locator("#tc-frequence").selectOption(o.frequence ?? "QUOTIDIENNE")
    await f.locator("#tc-zone").fill(o.zone ?? "")
    await f.getByRole("button", { name: "Ajouter la tâche" }).click()
  }
  const creerNc = async (p, o) => {
    const f = p.locator('[data-testid="form-nc"]:visible')
    await f.locator("#nc-titre").fill(o.titre ?? "")
    await f.locator("#nc-gravite").selectOption(o.gravite ?? "MINEURE")
    await f.locator("#nc-detail").fill(o.detail ?? "")
    await f.getByRole("button", { name: "Déclarer la non-conformité" }).click()
  }
  const creerTemoin = async (p, o) => {
    const f = p.locator('[data-testid="form-temoin"]:visible')
    await f.locator("#tm-date").fill(o.date ?? iso(0))
    await f.locator("#tm-service").selectOption("LUNCH")
    await f.locator("#tm-plat").fill(o.plat ?? "")
    await f.locator("#tm-emplacement").fill(o.emplacement ?? "")
    await f.getByRole("button", { name: "Enregistrer l'échantillon" }).click()
  }

  await etape("Accès : direction, cuisine et magasin voient la page ; la RH n'a ni la page ni l'entrée de menu", async () => {
    for (const p of [gest, chef, mag]) {
      await aller(p, "/haccp", "haccp-page")
      verifier((await p.locator('[data-testid="menu-principal"] a[href="/haccp"]').count()) >= 1, "entrée de menu Hygiène")
    }
    await aller(rh, "/haccp", "acces-refuse")
    verifier((await rh.locator('[data-testid="haccp-page"]').count()) === 0, "la RH n'accède pas à la page")
    verifier((await rh.locator('[data-testid="menu-principal"] a[href="/haccp"]').count()) === 0, "pas d'entrée de menu pour la RH")
  })

  await etape("Températures : équipement validé, relevés conformes et hors plage, non-conformité automatique", async () => {
    await aller(gest, "/haccp?vue=temperatures", "haccp-page")
    await creerEq(gest, { nom: "Z", min: "0", max: "4" })
    await texte(gest, "Nom invalide").waitFor()
    await creerEq(gest, { nom: "ZZ Frigo", min: "5", max: "4" })
    await texte(gest, "doit être inférieure").waitFor()
    await creerEq(gest, { nom: "ZZ Frigo", min: "0", max: "4" })
    await texte(gest, "Équipement ZZ Frigo ajouté.").waitFor()
    await creerEq(gest, { nom: "ZZ Frigo", min: "0", max: "4" })
    await texte(gest, "porte déjà ce nom").waitFor()
    const eq = await db.equipement.findFirst({ where: { etablissementId: E.id, nom: "ZZ Frigo" } })
    verifier(eq && Number(eq.tempMax) === 4, "équipement en base")
    await aller(chef, "/haccp?vue=temperatures", "haccp-page")
    verifier((await chef.locator('[data-testid="form-equipement"]').count()) === 0, "la cuisine ne crée pas d'équipement")
    await releve(chef, { eq: "", valeur: "3" })
    await texte(chef, "Choisissez un équipement").waitFor()
    await releve(chef, { eq: eq.id, valeur: "3" })
    await texte(chef, "Relevé enregistré : ZZ Frigo à 3 °C, conforme.").waitFor()
    await releve(chef, { eq: eq.id, valeur: "7.5" })
    await texte(chef, "Hors plage : indiquez l'action corrective.").waitFor()
    verifier((await db.releveTemperature.count({ where: { equipementId: eq.id } })) === 1, "le relevé hors plage sans action n'est pas enregistré")
    await releve(chef, { eq: eq.id, valeur: "7.5", action: "Porte refermée, contrôle dans une heure" })
    await texte(chef, "à 7.5 °C, hors plage. Une non-conformité majeure a été ouverte.").waitFor()
    const nc = await db.nonConformite.findFirst({ where: { etablissementId: E.id, source: "TEMPERATURE" } })
    verifier(nc && nc.gravite === "MAJEURE" && nc.statut === "OUVERTE", "non-conformité automatique majeure")
    await aller(gest, "/haccp?vue=temperatures", "haccp-page")
    verifier((await valeurKpi(gest, "releves-total")) === "2", "deux relevés sur sept jours")
    verifier((await valeurKpi(gest, "releves-taux")) === "50 %", "taux de conformité 50 %")
    verifier((await valeurKpi(gest, "nc-ouvertes")) === "1", "une non-conformité ouverte")
  })

  await etape("Hygiène : tâches validées, doublons refusés, une seule validation par période", async () => {
    await aller(gest, "/haccp?vue=hygiene", "haccp-page")
    await creerTache(gest, { nom: "ab" })
    await texte(gest, "Intitulé invalide").waitFor()
    await creerTache(gest, { nom: "ZZ Nettoyage plans", frequence: "QUOTIDIENNE", zone: "Cuisine" })
    await texte(gest, "Tâche d'hygiène ajoutée : ZZ Nettoyage plans.").waitFor()
    await creerTache(gest, { nom: "ZZ Degivrage", frequence: "HEBDOMADAIRE" })
    await texte(gest, "Tâche d'hygiène ajoutée : ZZ Degivrage.").waitFor()
    await creerTache(gest, { nom: "ZZ Degivrage", frequence: "HEBDOMADAIRE" })
    await texte(gest, "porte déjà cet intitulé").waitFor()
    await aller(chef, "/haccp?vue=hygiene", "table-taches")
    verifier((await chef.locator('[data-testid="form-tache"]').count()) === 0, "la cuisine ne crée pas de tâche")
    verifier((await valeurKpi(chef, "taches-restantes")) === "2", "deux tâches à faire")
    const ligne1 = chef.locator('[data-tache="ZZ Nettoyage plans"]')
    await ligne1.getByRole("button", { name: "Marquer fait" }).click()
    await attendre(async () => (await db.executionHygiene.count({ where: { etablissementId: E.id } })) === 1, "première exécution enregistrée")
    await attendre(async () => (await ligne1.innerText()).includes("Fait"), "tâche affichée comme faite")
    verifier((await ligne1.getByRole("button", { name: "Marquer fait" }).count()) === 0, "plus de bouton une fois faite")
    const ligne2 = chef.locator('[data-tache="ZZ Degivrage"]')
    await ligne2.getByRole("button", { name: "Marquer fait" }).click()
    await attendre(async () => (await db.executionHygiene.count({ where: { etablissementId: E.id } })) === 2, "seconde exécution enregistrée")
    await attendre(async () => (await valeurKpi(chef, "taches-restantes")) === "0", "plus aucune tâche à faire")
    verifier((await valeurKpi(chef, "taches-faites")) === "2", "deux tâches à jour")
  })

  await etape("Non-conformités : déclaration, correction, clôture réservée à l'administration, isolation", async () => {
    await aller(chef, "/haccp?vue=nc", "table-nc")
    verifier((await chef.locator('[data-nc="ZZ NC autre etablissement"]').count()) === 0, "non-conformité d'un autre établissement invisible")
    await creerNc(chef, { titre: "ab", gravite: "MINEURE" })
    await texte(chef, "Titre invalide").waitFor()
    await creerNc(chef, { titre: "ZZ Bac de graisse debordant", gravite: "CRITIQUE", detail: "Constaté après le service" })
    await texte(chef, "Non-conformité enregistrée : ZZ Bac de graisse debordant.").waitFor()
    const manuelle = await db.nonConformite.findFirst({ where: { etablissementId: E.id, titre: "ZZ Bac de graisse debordant" } })
    verifier(manuelle && manuelle.gravite === "CRITIQUE" && manuelle.source === "MANUELLE", "non-conformité manuelle en base")
    const temp = chef.locator('[data-nc="Température hors plage : ZZ Frigo"]')
    verifier((await temp.getByRole("button", { name: "Clôturer" }).count()) === 0, "la cuisine ne clôture jamais")
    await temp.locator("input[name=action]").fill("")
    await temp.getByRole("button", { name: "Enregistrer la correction" }).click()
    await texte(chef, "Action corrective invalide").waitFor()
    await temp.locator("input[name=action]").fill("Joint de porte remplacé, relevé de contrôle conforme")
    await temp.getByRole("button", { name: "Enregistrer la correction" }).click()
    await attendre(async () => (await db.nonConformite.findFirst({ where: { etablissementId: E.id, source: "TEMPERATURE" } }))?.statut === "CORRIGEE", "non-conformité corrigée")
    await aller(gest, "/haccp?vue=nc", "table-nc")
    const ligneG = gest.locator('[data-nc="Température hors plage : ZZ Frigo"]')
    verifier((await ligneG.innerText()).includes("Corrigée"), "statut Corrigée affiché")
    verifier((await gest.locator('[data-nc="ZZ Bac de graisse debordant"]').getByRole("button", { name: "Clôturer" }).count()) === 0, "une non-conformité ouverte ne se clôture pas directement")
    await ligneG.getByRole("button", { name: "Clôturer" }).click()
    await attendre(async () => {
      const x = await db.nonConformite.findFirst({ where: { etablissementId: E.id, source: "TEMPERATURE" } })
      return x?.statut === "CLOTUREE" && x.closLe !== null
    }, "non-conformité clôturée")
  })

  await etape("Témoins et traçabilité : échantillons conservés cinq jours, rappel d'un lot, autre établissement invisible", async () => {
    await aller(chef, "/haccp?vue=temoins", "table-temoins")
    await creerTemoin(chef, { date: iso(1), plat: "ZZ Riz sauce graine" })
    await texte(chef, "Date invalide").waitFor()
    await creerTemoin(chef, { plat: "Z" })
    await texte(chef, "Nom du plat invalide").waitFor()
    await creerTemoin(chef, { plat: "ZZ Riz sauce graine", emplacement: "Frigo 1" })
    await texte(chef, "Échantillon témoin enregistré : ZZ Riz sauce graine, conservé jusqu'au " + fr(iso(5)) + ".").waitFor()
    const t = await db.echantillonTemoin.findFirst({ where: { etablissementId: E.id, platNom: "ZZ Riz sauce graine" } })
    verifier(t && t.conserveJusqu.toISOString().slice(0, 10) === iso(5), "conservation de cinq jours")
    await creerTemoin(chef, { plat: "ZZ Riz sauce graine", emplacement: "Frigo 1" })
    await texte(chef, "déjà enregistré").waitFor()
    const neuf = chef.locator('[data-temoin="ZZ Riz sauce graine"]')
    verifier((await neuf.innerText()).includes("À conserver"), "échantillon récent à conserver")
    verifier((await neuf.getByRole("button", { name: "Marquer jeté" }).count()) === 0, "pas de bouton avant la fin de conservation")
    const ancien = chef.locator('[data-temoin="ZZ Plat ancien"]')
    verifier((await ancien.innerText()).includes("À jeter"), "échantillon expiré à jeter")
    await ancien.getByRole("button", { name: "Marquer jeté" }).click()
    await attendre(async () => (await db.echantillonTemoin.findUnique({ where: { id: vieux.id } }))?.jete === true, "échantillon marqué jeté")

    await aller(gest, "/haccp?vue=tracabilite", "form-tracabilite")
    const f = gest.locator('[data-testid="form-tracabilite"]:visible')
    await f.locator("#tr-lot").fill("ZZ-LOT")
    await f.getByRole("button", { name: "Rechercher" }).click()
    await gest.locator('[data-testid="resultat-tracabilite"]:visible').waitFor()
    verifier((await gest.locator('[data-lot="ZZ-LOT-001"]').count()) === 1, "le lot de l'établissement est trouvé")
    verifier((await gest.locator('[data-lot="ZZ-LOT-002"]').count()) === 0, "le lot d'un autre établissement reste invisible")
    const resume = (await gest.locator('[data-testid="resume-rappel"]').first().innerText()).replace(/\s+/g, " ")
    verifier(resume.includes("2 service(s) concerné(s)") && resume.includes("220 repas"), "résumé du rappel : " + resume)
  })

  await etape("Rôles et traçabilité : le magasin saisit sans administrer, accès anonyme refusé, audit écrit", async () => {
    await aller(mag, "/haccp?vue=temperatures", "haccp-page")
    verifier((await mag.locator('[data-testid="form-releve"]:visible').count()) === 1, "le magasin peut saisir un relevé")
    verifier((await mag.locator('[data-testid="form-equipement"]').count()) === 0, "le magasin ne crée pas d'équipement")
    verifier((await mag.getByRole("button", { name: "Désactiver" }).count()) === 0, "le magasin ne désactive rien")
    const r = await fetch(BASE + "/haccp", { redirect: "manual" })
    verifier([301, 302, 303, 307, 308].includes(r.status), "accès anonyme redirigé, statut " + r.status)
    const compte = (email, action) => db.auditLog.count({ where: { userEmail: email, action } })
    verifier((await compte(GEST, "EQUIPEMENT_CREE")) >= 1, "audit équipement")
    verifier((await compte(CHEF, "RELEVE_ENREGISTRE")) >= 2, "audit relevés")
    verifier((await compte(CHEF, "TACHE_FAITE")) >= 2, "audit tâches")
    verifier((await compte(CHEF, "NC_CORRIGEE")) >= 1, "audit correction")
    verifier((await compte(GEST, "NC_CLOTUREE")) >= 1, "audit clôture")
    verifier((await compte(CHEF, "TEMOIN_CREE")) >= 1, "audit échantillon")
  })

  function nc0() {
    return ncTemp
  }
}

let ncTemp = null
const _principal = principal
async function lancer() {
  // la non-conformite automatique est creee pendant le test ; on la recherche a la demande
  const origine = db.nonConformite.findUnique.bind(db.nonConformite)
  void origine
  await _principal()
}

lancer()
  .then(() => terminer(nettoyer, "HACCP", 0))
  .catch((e) => {
    console.log("ERREUR : " + e.message)
    return terminer(nettoyer, "HACCP", 1)
  })