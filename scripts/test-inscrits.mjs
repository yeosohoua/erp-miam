import "dotenv/config"
import { randomBytes } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"

import { PrismaPg } from "@prisma/adapter-pg"
import * as bcryptModule from "bcryptjs"
import Redis from "ioredis"
import { chromium } from "playwright"

import { PrismaClient } from "../src/generated/prisma/client.ts"

const bcrypt = bcryptModule.default ?? bcryptModule
const PORT = 3103
const BASE = "http://localhost:" + PORT
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const redis = new Redis(process.env.REDIS_URL)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const secret = () => randomBytes(8).toString("hex") + "Zz9"
const mdp1 = secret()
const mdp2 = secret()
const mdpC = secret()
const M1 = "test-in-mgr1@miam.test"
const M2 = "test-in-mgr2@miam.test"
const CA = "test-in-caisse@miam.test"
const EMAILS = [M1, M2, CA]

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
  const p = await (await navigateur.newContext({ locale: "fr-FR", viewport: { width: 1440, height: 900 } })).newPage()
  p.setDefaultTimeout(30000)
  return p
}

async function ouvrir(chemin, p) {
  await p.goto(BASE + chemin, { waitUntil: "load" })
  await p.waitForLoadState("networkidle").catch(() => {})
  await sleep(400)
}

async function connecter(email, mdp) {
  const p = await nouvellePage()
  await ouvrir("/login", p)
  await p.locator('input[name="email"]').fill(email)
  await p.locator('input[name="password"]').fill(mdp)
  await p.locator('button[type="submit"]').first().click()
  await p.waitForURL((u) => u.pathname === "/", { timeout: 30000 })
  await p.locator('[data-testid="menu-principal"]').waitFor()
  return p
}

const cheminAttendu = (p, chemin, message) => attendre(() => new URL(p.url()).pathname === chemin, message)
const alerte = (p, texte) => p.locator('p[role="alert"]').filter({ hasText: texte }).waitFor()
const statut = (p, texte) => p.locator('[role="status"]').filter({ hasText: texte }).waitFor()

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { OR: [{ userEmail: { in: EMAILS } }, { details: { contains: "ZZ" } }] } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const IA = await db.etablissement.create({ data: { code: "ZZ-IA", name: "ZZ Ecole IA", type: "SCHOOL" } })
  const IB = await db.etablissement.create({ data: { code: "ZZ-IB", name: "ZZ Ecole IB", type: "SCHOOL" } })
  const creerUser = (email, name, role, mdp, etab) =>
    db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: etab.id }] } } })
  await creerUser(M1, "Test In Mgr1", "MANAGER", mdp1, IA)
  await creerUser(M2, "Test In Mgr2", "MANAGER", mdp2, IB)
  await creerUser(CA, "Test In Caisse", "CASHIER", mdpC, IA)

  serveur = spawn("npx", ["next", "start", "-p", String(PORT)], { shell: true, cwd: process.cwd(), env: process.env, stdio: "ignore" })
  await attendre(async () => {
    try {
      return (await fetch(BASE + "/api/sante")).ok
    } catch {
      return false
    }
  }, "demarrage du serveur", 60000)
  navigateur = await chromium.launch()
  const p1 = await connecter(M1, mdp1)

  let groupe, regime, allergie
  await etape("Référentiels : groupe, régime et allergie créés, doublon refusé", async () => {
    await ouvrir("/inscrits/referentiels", p1)
    const ajout = async (kind, nom) => {
      await p1.locator("#ref-nom-" + kind).fill(nom)
      await p1.locator('[data-testid="ref-' + kind + '"] button[type="submit"]').click()
    }
    const trouver = (kind, name) => db.referentiel.findFirst({ where: { etablissementId: IA.id, kind, name } })
    await ajout("GROUPE", "ZZ 6eA")
    groupe = await attendre(() => trouver("GROUPE", "ZZ 6eA"), "groupe créé")
    await ajout("GROUPE", "ZZ 6eA")
    await alerte(p1, "existe déjà")
    await ajout("REGIME", "ZZ Sans porc")
    regime = await attendre(() => trouver("REGIME", "ZZ Sans porc"), "régime créé")
    await ajout("ALLERGIE", "ZZ Arachide")
    allergie = await attendre(() => trouver("ALLERGIE", "ZZ Arachide"), "allergie créée")
  })

  let ins
  await etape("Inscrit : nom manquant refusé, création complète, doublon refusé, recherche", async () => {
    await ouvrir("/inscrits", p1)
    await p1.locator("#ins-matricule").fill("ZI001")
    await p1.locator("#ins-prenom").fill("Awa")
    await p1.getByRole("button", { name: "Créer l'inscrit" }).click()
    await alerte(p1, "obligatoires")
    await p1.locator("#ins-nom").fill("Kone")
    await p1.locator("#ins-groupe").selectOption(groupe.id)
    await p1.locator("#ins-regime").selectOption(regime.id)
    await p1.locator('input[name="allergies"][value="' + allergie.id + '"]').check()
    await p1.getByRole("button", { name: "Créer l'inscrit" }).click()
    ins = await attendre(
      () => db.inscrit.findUnique({ where: { etablissementId_matricule: { etablissementId: IA.id, matricule: "ZI001" } }, include: { allergies: true } }),
      "inscrit créé",
    )
    verifier(/^[0-9A-F]{16}$/.test(ins.badge), "badge de 16 caractères hexadécimaux")
    verifier(ins.groupeId === groupe.id && ins.regimeId === regime.id && ins.allergies.length === 1, "groupe, régime et allergie enregistrés")
    await p1.locator("#ins-matricule").fill("ZI001")
    await p1.locator("#ins-prenom").fill("Dup")
    await p1.locator("#ins-nom").fill("Dup")
    await p1.getByRole("button", { name: "Créer l'inscrit" }).click()
    await alerte(p1, "déjà utilisé")
    await ouvrir("/inscrits?q=ZI001", p1)
    await p1.locator('tr[data-matricule="ZI001"]').waitFor()
    await ouvrir("/inscrits?q=introuvable-xyz", p1)
    await p1.locator('[data-testid="aucun-inscrit"]').waitFor()
  })

  await etape("Fiche : modification et statut, tuteur ajouté puis retiré, badge régénéré", async () => {
    await ouvrir("/inscrits/" + ins.id, p1)
    await p1.locator("#ins-prenom").fill("Awa Marie")
    await p1.locator("#ins-statut").selectOption("SUSPENDED")
    await p1.getByRole("button", { name: "Enregistrer", exact: true }).click()
    await attendre(async () => {
      const x = await db.inscrit.findUnique({ where: { id: ins.id } })
      return x.firstName === "Awa Marie" && x.statut === "SUSPENDED"
    }, "fiche modifiée")
    await p1.locator("#tut-nom").fill("ZZ Tuteur")
    await p1.locator("#tut-relation").fill("Mère")
    await p1.locator("#tut-tel").fill("+22507000000")
    await p1.getByRole("button", { name: "Ajouter le tuteur" }).click()
    await attendre(async () => (await db.tuteur.count({ where: { inscritId: ins.id } })) === 1, "tuteur ajouté")
    const li = p1.locator('li[data-tuteur="ZZ Tuteur"]')
    await li.waitFor()
    await li.getByRole("button", { name: "Retirer" }).click()
    await attendre(async () => (await db.tuteur.count({ where: { inscritId: ins.id } })) === 0, "tuteur retiré")
    const avant = (await db.inscrit.findUnique({ where: { id: ins.id } })).badge
    await p1.getByRole("button", { name: "Régénérer le badge" }).click()
    await attendre(async () => (await db.inscrit.findUnique({ where: { id: ins.id } })).badge !== avant, "badge régénéré")
  })

  await etape("Isolation : un autre établissement ne voit ni la liste ni la fiche", async () => {
    const p2 = await connecter(M2, mdp2)
    await ouvrir("/inscrits?q=ZI001", p2)
    await p2.locator('[data-testid="liste-inscrits"]').waitFor()
    verifier((await p2.locator('tr[data-matricule="ZI001"]').count()) === 0, "l'inscrit de A est invisible depuis B")
    await p2.goto(BASE + "/inscrits/" + ins.id, { waitUntil: "load" })
    await cheminAttendu(p2, "/inscrits", "fiche d'un autre établissement refusée")
    await p2.context().close()
  })

  await etape("Caissier : consulte sans modifier, import et référentiels refusés", async () => {
    const c = await connecter(CA, mdpC)
    await ouvrir("/inscrits", c)
    await c.locator('tr[data-matricule="ZI001"]').waitFor()
    verifier((await c.locator('[data-testid="form-inscrit"]').count()) === 0, "pas de formulaire de création")
    await c.goto(BASE + "/inscrits/import", { waitUntil: "load" })
    await cheminAttendu(c, "/inscrits", "import refusé")
    await c.goto(BASE + "/inscrits/referentiels", { waitUntil: "load" })
    await cheminAttendu(c, "/inscrits", "référentiels refusés")
    await ouvrir("/inscrits/" + ins.id, c)
    await c.locator('[data-testid="fiche-inscrit"]').waitFor()
    verifier((await c.locator("#ins-prenom").count()) === 0, "fiche en lecture seule")
    await c.context().close()
  })

  await etape("Import CSV : fichier invalide rejeté en bloc, import valide, doublon refusé", async () => {
    await ouvrir("/inscrits/import", p1)
    const mauvais = "matricule;prenom;nom;type;groupe;regime\nZI101;Awa;Kone;eleve;ZZ CE1;\nZI102;Yao;Koffi;martien;;"
    await p1.locator("#import-texte").fill(mauvais)
    await p1.getByRole("button", { name: "Importer" }).click()
    await alerte(p1, "type inconnu")
    verifier((await db.inscrit.count({ where: { etablissementId: IA.id, matricule: { startsWith: "ZI1" } } })) === 0, "rien n'est enregistré si une ligne est invalide")
    const bon = "matricule;prenom;nom;type;groupe;regime\nZI101;Awa;Kone;eleve;ZZ CE1;\nZI102;Yao;Koffi;employe;;ZZ Halal\nZI103;Mariam;Traore;invite;ZZ CE1;"
    await p1.locator("#import-texte").fill(bon)
    await p1.getByRole("button", { name: "Importer" }).click()
    await statut(p1, "3 inscrit")
    verifier((await db.inscrit.count({ where: { etablissementId: IA.id, matricule: { startsWith: "ZI1" } } })) === 3, "3 inscrits importés")
    verifier(!!(await db.referentiel.findFirst({ where: { etablissementId: IA.id, kind: "GROUPE", name: "ZZ CE1" } })), "groupe créé par l'import")
    verifier(!!(await db.referentiel.findFirst({ where: { etablissementId: IA.id, kind: "REGIME", name: "ZZ Halal" } })), "régime créé par l'import")
    verifier((await db.inscrit.findUnique({ where: { etablissementId_matricule: { etablissementId: IA.id, matricule: "ZI102" } } })).type === "EMPLOYEE", "type employé")
    await p1.locator("#import-texte").fill(bon)
    await p1.getByRole("button", { name: "Importer" }).click()
    await alerte(p1, "déjà existant")
  })

  await etape("Référentiel utilisé non supprimable, référentiel libre supprimé, audit complet", async () => {
    await ouvrir("/inscrits/referentiels", p1)
    await p1.locator('li[data-ref="ZZ 6eA"]').getByRole("button", { name: "Supprimer" }).click()
    await alerte(p1, "suppression impossible")
    verifier(!!(await db.referentiel.findUnique({ where: { id: groupe.id } })), "le groupe utilisé est conservé")
    await p1.locator("#ref-nom-ALLERGIE").fill("ZZ Libre")
    await p1.locator('[data-testid="ref-ALLERGIE"] button[type="submit"]').click()
    const libre = await attendre(() => db.referentiel.findFirst({ where: { etablissementId: IA.id, kind: "ALLERGIE", name: "ZZ Libre" } }), "allergie libre créée")
    await p1.locator('li[data-ref="ZZ Libre"]').getByRole("button", { name: "Supprimer" }).click()
    await attendre(async () => (await db.referentiel.findUnique({ where: { id: libre.id } })) === null, "allergie libre supprimée")
    for (const action of ["REFERENTIEL_CREATED", "REFERENTIEL_DELETED", "INSCRIT_CREATED", "INSCRIT_UPDATED", "BADGE_REGENERATED", "TUTEUR_ADDED", "TUTEUR_REMOVED", "INSCRITS_IMPORTED"]) {
      verifier(!!(await db.auditLog.findFirst({ where: { action } })), "audit " + action + " attendu")
    }
  })

  await p1.context().close()
}

let code = 0
try {
  await principal()
} catch (e) {
  code = 1
  console.log("  ERREUR : " + (e && e.message ? e.message : e))
} finally {
  if (navigateur) await navigateur.close().catch(() => {})
  if (serveur) {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(serveur.pid), "/T", "/F"])
    else serveur.kill()
  }
  await nettoyer().catch((e) => console.log("Nettoyage incomplet : " + e.message))
  await db.$disconnect().catch(() => {})
  redis.disconnect()
}

const reussies = resultats.filter((r) => r.ok).length
console.log("")
console.log("Resultat : " + reussies + " / " + resultats.length + " etapes reussies")
console.log(code === 0 ? "=== TESTS INSCRITS OK ===" : "=== TESTS INSCRITS ECHEC ===")
process.exit(code)