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
const PROCH = (() => {
  const n = new Date()
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1))
})()

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

const PORT = 3117
const BASE = "http://localhost:" + PORT
const mdpRh = secret()
const mdpCompta = secret()
const mdpCaisse = secret()
const RH = "test-pa-rh@miam.test"
const COMPTA = "test-pa-compta@miam.test"
const CAISSE = "test-pa-caisse@miam.test"
const EMAILS = [RH, COMPTA, CAISSE]

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: { in: EMAILS } } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-PA", name: "ZZ Cantine Paie", type: "SCHOOL" } })
  const E2 = await db.etablissement.create({ data: { code: "ZZ-PB", name: "ZZ Autre Paie", type: "SCHOOL" } })
  const creerUser = (email, name, role, mdp) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  await creerUser(RH, "Test Pa Rh", "HR", mdpRh)
  await creerUser(COMPTA, "Test Pa Compta", "ACCOUNTANT", mdpCompta)
  await creerUser(CAISSE, "Test Pa Caisse", "CASHIER", mdpCaisse)

  // Cas limites poses en base : un employe inactif, un employe pas encore embauche, un employe d'un autre etablissement.
  const E3 = await db.employeRh.create({ data: { etablissementId: E.id, matricule: "ZZ-E3", firstName: "Inactif", lastName: "Paie", dateEmbauche: new Date("2024-01-01T00:00:00.000Z"), salaireBase: 100000, actif: false } })
  await db.employeRh.create({ data: { etablissementId: E.id, matricule: "ZZ-E4", firstName: "Futur", lastName: "Paie", dateEmbauche: PROCH, salaireBase: 100000 } })
  await db.employeRh.create({ data: { etablissementId: E2.id, matricule: "ZZ-X", firstName: "Autre", lastName: "Etab", dateEmbauche: new Date("2024-01-01T00:00:00.000Z"), salaireBase: 90000 } })

  const CRON = secret() + secret()
  process.env.CRON_SECRET = CRON
  await demarrer(BASE, PORT)
  const rh = await connecter(BASE, RH, mdpRh)
  const cpt = await connecter(BASE, COMPTA, mdpCompta)
  const texte = (p, t) => p.getByText(t).filter({ visible: true }).first()
  const aller = async (p, chemin, testid = "rh-page") => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
  }
  const bulletins = (p) => aller(p, "/rh?vue=bulletins&periode=" + MOIS)
  const ligne = (p, mat) => p.locator('tr[data-bulletin][data-matricule="' + mat + '"]:visible')
  const attr = async (loc, nom) => Number(await loc.getAttribute(nom))
  const generer = async (p) => {
    await bulletins(p)
    await p.getByRole("button", { name: "Générer / recalculer" }).click()
  }
  const creerEmp = async (o) => {
    await rh.locator("#em-matricule:visible").fill(o.matricule)
    await rh.locator("#em-prenom:visible").fill(o.prenom)
    await rh.locator("#em-nom:visible").fill(o.nom)
    await rh.locator("#em-poste:visible").fill("Cuisine")
    await rh.locator("#em-embauche:visible").fill("2024-01-15")
    await rh.locator("#em-base:visible").fill(o.base)
    await rh.locator("#em-primes:visible").fill("0")
    await rh.locator("#em-exo:visible").fill("0")
    await rh.locator("#em-situation:visible").selectOption(o.situation)
    await rh.locator("#em-enfants:visible").fill(o.enfants)
    await rh.locator("#em-cmu:visible").fill("1")
    await rh.getByRole("button", { name: "Ajouter l'employé" }).click()
  }
  const bpEnBase = (mat) => db.bulletinPaie.findFirst({ where: { etablissementId: E.id, periode: MOIS, employe: { matricule: mat } } })
  const desequilibres = () => db.$queryRaw`SELECT e.id FROM ecritures_compta e JOIN ecriture_lignes l ON l."ecritureId" = e.id WHERE e."etablissementId" = ${E.id} GROUP BY e.id HAVING SUM(l.debit) <> SUM(l.credit)`

  await etape("Accès : le caissier est renvoyé, la RH peut saisir, le comptable ne crée pas d'employé", async () => {
    const caisse = await connecter(BASE, CAISSE, mdpCaisse)
    await caisse.goto(BASE + "/rh", { waitUntil: "load" })
    await caisse.waitForURL((u) => u.pathname === "/")
    await aller(rh, "/rh?vue=employes")
    verifier((await rh.locator('[data-testid="form-employe"]:visible').count()) === 1, "la RH voit le formulaire d'employé")
    await aller(cpt, "/rh?vue=employes")
    verifier((await cpt.locator('[data-testid="form-employe"]:visible').count()) === 0, "le comptable ne voit pas le formulaire d'employé")
    verifier((await rh.locator("tr[data-employe]:visible").count()) === 2, "deux employés posés en base visibles (E3 inactif, E4 futur), pas celui de l'autre établissement")
  })

  await etape("Employés : validations, doublon refusé, création de deux employés", async () => {
    await aller(rh, "/rh?vue=employes")
    await creerEmp({ matricule: "ZZ-E1", prenom: "Awa", nom: "Kone", base: "0", situation: "CELIBATAIRE", enfants: "0" })
    await texte(rh, "Salaire de base invalide").waitFor()
    await creerEmp({ matricule: "ZZ-E1", prenom: "Awa", nom: "Kone", base: "150000", situation: "CELIBATAIRE", enfants: "0" })
    await texte(rh, "Employé ZZ-E1 enregistré").waitFor()
    await creerEmp({ matricule: "ZZ-E1", prenom: "Autre", nom: "Doublon", base: "150000", situation: "CELIBATAIRE", enfants: "0" })
    await texte(rh, "existe déjà").waitFor()
    await creerEmp({ matricule: "ZZ-E2", prenom: "Yao", nom: "Traore", base: "500000", situation: "MARIE", enfants: "2" })
    await texte(rh, "Employé ZZ-E2 enregistré").waitFor()
    await attendre(async () => (await db.employeRh.count({ where: { etablissementId: E.id, matricule: { in: ["ZZ-E1", "ZZ-E2"] } } })) === 2, "deux employés en base")
  })

  await etape("Modification d'un employé", async () => {
    const e1 = await db.employeRh.findFirst({ where: { etablissementId: E.id, matricule: "ZZ-E1" } })
    await aller(rh, "/rh?vue=employes&edit=" + e1.id)
    await rh.locator("#em-poste:visible").fill("Cuisinier")
    await rh.getByRole("button", { name: "Mettre à jour" }).click()
    await texte(rh, "mis à jour").waitFor()
    await attendre(async () => (await db.employeRh.findUnique({ where: { id: e1.id } })).poste === "Cuisinier", "poste modifié")
  })

  await etape("Bulletins : génération, montants exacts, rejouable, brouillon supprimable", async () => {
    await generer(rh)
    await texte(rh, "2 bulletin(s) créé(s)").waitFor()
    await bulletins(rh)
    verifier((await rh.locator("tr[data-bulletin]:visible").count()) === 2, "deux bulletins (ni inactif, ni futur)")
    const a = ligne(rh, "ZZ-E1")
    const b = ligne(rh, "ZZ-E2")
    verifier((await attr(a, "data-its")) === 12000 && (await attr(a, "data-net")) === 128050, "ZZ-E1 : ITS 12000, net 128050")
    verifier((await attr(b, "data-its")) === 59000 && (await attr(b, "data-net")) === 409000, "ZZ-E2 : ITS 59000, net 409000")
    const tot = rh.locator('[data-testid="bulletins-total"]:visible')
    verifier((await attr(tot, "data-brut")) === 650000 && (await attr(tot, "data-net")) === 537050, "totaux : brut 650000, net 537050")
    await generer(rh)
    await texte(rh, "0 bulletin(s) créé(s), 2 recalculé(s)").waitFor()
    await bulletins(rh)
    await ligne(rh, "ZZ-E2").getByRole("button", { name: "Supprimer" }).click()
    await attendre(async () => (await db.bulletinPaie.count({ where: { etablissementId: E.id, periode: MOIS } })) === 1, "brouillon supprimé")
    await generer(rh)
    await texte(rh, "1 bulletin(s) créé(s), 1 recalculé(s)").waitFor()
    verifier((await db.bulletinPaie.count({ where: { etablissementId: E.id, periode: MOIS } })) === 2, "deux bulletins de nouveau")
    verifier((await rh.getByRole("button", { name: "Valider les bulletins" }).count()) === 0, "la RH ne valide pas la paie")
  })

  await etape("Paramètres : lecture seule pour la RH, validation des taux, la déductibilité CNPS change l'ITS", async () => {
    await aller(rh, "/rh?vue=parametres", "form-parametres")
    verifier((await rh.getByRole("button", { name: "Enregistrer les paramètres" }).count()) === 0, "la RH ne modifie pas les paramètres")
    await aller(cpt, "/rh?vue=parametres", "form-parametres")
    await cpt.locator("#pa-retraiteSalarie:visible").fill("abc")
    await cpt.getByRole("button", { name: "Enregistrer les paramètres" }).click()
    await texte(cpt, "Taux invalide").waitFor()
    await aller(cpt, "/rh?vue=parametres", "form-parametres")
    await cpt.locator("#pa-cnpsDeductibleIts:visible").check()
    await cpt.getByRole("button", { name: "Enregistrer les paramètres" }).click()
    await texte(cpt, "Paramètres de paie enregistrés").waitFor()
    await attendre(async () => (await db.parametresPaie.findUnique({ where: { etablissementId: E.id } }))?.cnpsDeductibleIts === true, "paramètre enregistré")
    await generer(rh)
    await texte(rh, "recalculé(s)").waitFor()
    verifier((await bpEnBase("ZZ-E1")).its === 10488, "ITS de ZZ-E1 recalculé à 10488")
    await aller(cpt, "/rh?vue=parametres", "form-parametres")
    await cpt.locator("#pa-cnpsDeductibleIts:visible").uncheck()
    await cpt.getByRole("button", { name: "Enregistrer les paramètres" }).click()
    await texte(cpt, "Paramètres de paie enregistrés").waitFor()
    await attendre(async () => (await db.parametresPaie.findUnique({ where: { etablissementId: E.id } }))?.cnpsDeductibleIts === false, "paramètre rétabli")
    await generer(rh)
    await texte(rh, "recalculé(s)").waitFor()
    verifier((await bpEnBase("ZZ-E1")).its === 12000, "ITS de ZZ-E1 revenu à 12000")
  })

  await etape("Validation : définitive, non régénérable, non rejouable", async () => {
    await bulletins(cpt)
    await cpt.getByRole("button", { name: "Valider les bulletins" }).click()
    await texte(cpt, "2 bulletin(s) validé(s)").waitFor()
    verifier((await db.bulletinPaie.count({ where: { etablissementId: E.id, periode: MOIS, statut: "VALIDATED" } })) === 2, "deux bulletins validés")
    await bulletins(cpt)
    await cpt.getByRole("button", { name: "Valider les bulletins" }).click()
    await texte(cpt, "Aucun bulletin en brouillon").waitFor()
    await generer(rh)
    await texte(rh, "0 bulletin(s) créé(s), 0 recalculé(s), 2 déjà validé(s)").waitFor()
    await bulletins(rh)
    verifier((await rh.getByRole("button", { name: "Supprimer" }).count()) === 0, "plus de suppression possible")
    verifier((await bpEnBase("ZZ-E2")).net === 409000, "les montants validés ne changent pas")
  })

  await etape("Bulletin imprimable ; un bulletin inconnu ou d'un autre établissement ne s'affiche pas", async () => {
    const b = await bpEnBase("ZZ-E1")
    await aller(rh, "/rh/bulletin/" + b.id, "bulletin")
    const net = rh.locator('[data-testid="bulletin-net"]:visible')
    verifier((await attr(net, "data-valeur")) === 128050, "net du bulletin 128050")
    verifier((await rh.locator('[data-testid="btn-imprimer"]:visible').count()) === 1, "bouton d'impression")
    const x = await db.employeRh.findFirst({ where: { etablissementId: E2.id, matricule: "ZZ-X" } })
    const bx = await db.bulletinPaie.create({ data: { etablissementId: E2.id, employeId: x.id, periode: MOIS, statut: "VALIDATED", brut: 90000, partsX2: 2, baseIts: 90000, its: 0, retraiteSalarie: 5670, cmuSalarie: 500, net: 83830, retraitePatronale: 6930, pf: 3750, maternite: 563, at: 1500, cmuPatronale: 500, taxesPatronales: 2520, coutEmployeur: 105763 } })
    for (const id of [bx.id, "inconnu-zz"]) {
      await rh.goto(BASE + "/rh/bulletin/" + id, { waitUntil: "load" })
      await rh.waitForLoadState("networkidle").catch(() => {})
      await sleep(1500)
      verifier((await rh.locator('[data-testid="bulletin"]').count()) === 0, "le bulletin " + id + " ne doit pas s'afficher")
      verifier((await rh.getByText("83 830").count()) === 0, "aucun montant de l'autre établissement affiché")
    }
  })

  await etape("Comptabilité : deux écritures de paie équilibrées, soldes exacts, rejouable", async () => {
    await aller(cpt, "/comptabilite?vue=journal&periode=tout", "compta-page")
    verifier((await attr(cpt.locator('[data-testid="compta-attente"]:visible'), "data-valeur")) === 2, "deux pièces de paie en attente")
    await cpt.getByRole("button", { name: "Comptabiliser maintenant" }).click()
    await texte(cpt, "2 écriture(s) comptabilisée(s)").waitFor()
    await attendre(async () => (await db.ecritureCompta.count({ where: { etablissementId: E.id, sourceType: "PAIE" } })) === 2, "deux écritures de paie")
    verifier((await desequilibres()).length === 0, "écritures équilibrées")
    await aller(cpt, "/comptabilite?vue=balance&periode=tout", "compta-page")
    const attendus = { "661": [650000, 0], "664": [62676, 0], "641": [18200, 0], "421": [0, 537050], "431": [0, 104626], "447": [0, 89200] }
    for (const [compte, [d, c]] of Object.entries(attendus)) {
      const l = cpt.locator('tr[data-compte="' + compte + '"]:visible')
      const dd = await attr(l, "data-debit")
      const cc = await attr(l, "data-credit")
      verifier(dd === d && cc === c, "compte " + compte + " : " + dd + "/" + cc + " au lieu de " + d + "/" + c)
    }
    await aller(cpt, "/comptabilite?vue=journal&periode=tout", "compta-page")
    await cpt.getByRole("button", { name: "Comptabiliser maintenant" }).click()
    await texte(cpt, "Rien à comptabiliser").waitFor()
    verifier((await db.ecritureCompta.count({ where: { etablissementId: E.id, sourceType: "PAIE" } })) === 2, "toujours deux écritures")
  })

  await etape("Réactivation, audit et isolation entre établissements", async () => {
    await aller(rh, "/rh?vue=employes")
    await rh.locator('tr[data-matricule="ZZ-E3"]:visible').getByRole("button", { name: "Réactiver" }).click()
    await attendre(async () => (await db.employeRh.findUnique({ where: { id: E3.id } })).actif === true, "employé réactivé")
    for (const [action, email] of [["RH_EMPLOYE_CREE", RH], ["RH_EMPLOYE_MODIFIE", RH], ["PAIE_GENEREE", RH], ["RH_EMPLOYE_ACTIVE", RH], ["PAIE_PARAMETRES", COMPTA], ["PAIE_VALIDEE", COMPTA]]) {
      verifier(!!(await db.auditLog.findFirst({ where: { action, userEmail: email } })), "audit " + action)
    }
    verifier((await db.ecritureCompta.count({ where: { etablissementId: E2.id } })) === 0, "aucune écriture comptable dans l'autre établissement")
  })

  await etape("Menu du comptable et livre de paie en CSV (comptable et RH oui, caissier non, mois invalide refusé)", async () => {
    await cpt.goto(BASE + "/", { waitUntil: "load" })
    await cpt.locator('[data-testid="menu-principal"]').waitFor()
    verifier((await cpt.locator('[data-testid="menu-principal"] a[href="/rh"]').count()) >= 1, "le comptable a l'entrée RH et paie dans son menu")
    const r = await cpt.context().request.get(BASE + "/api/rh/livre-paie?periode=" + MOIS)
    verifier(r.status() === 200 && (r.headers()["content-type"] ?? "").includes("text/csv"), "livre de paie en CSV")
    const corps = await r.text()
    verifier(corps.includes("Matricule") && corps.includes("ZZ-E1") && corps.includes("ZZ-E2") && corps.includes("128050") && corps.includes("409000"), "lignes des deux employés")
    verifier(corps.includes('"Total"') && corps.includes("537050") && !corps.includes("ZZ-E4"), "ligne de total, ni inactif ni futur")
    verifier((await rh.context().request.get(BASE + "/api/rh/livre-paie?periode=" + MOIS)).status() === 200, "export accessible à la RH")
    const caisse = await connecter(BASE, CAISSE, mdpCaisse)
    verifier((await caisse.context().request.get(BASE + "/api/rh/livre-paie?periode=" + MOIS)).status() === 403, "export refusé au caissier")
    verifier((await cpt.context().request.get(BASE + "/api/rh/livre-paie?periode=2026-13")).status() === 400, "mois invalide refusé")
    verifier(!!(await db.auditLog.findFirst({ where: { action: "PAIE_EXPORT", userEmail: COMPTA } })), "audit PAIE_EXPORT")
  })

  await etape("Appel planifié : comptabilisation automatique, limitée à un établissement, rejouable, secret exigé", async () => {
    const e3 = await db.employeRh.findFirst({ where: { etablissementId: E.id, matricule: "ZZ-E3" } })
    await db.bulletinPaie.create({ data: { etablissementId: E.id, employeId: e3.id, periode: MOIS, statut: "VALIDATED", valideLe: new Date(), brut: 100000, partsX2: 2, baseIts: 100000, its: 4000, retraiteSalarie: 6300, cmuSalarie: 500, net: 89200, retraitePatronale: 7700, pf: 3750, maternite: 563, at: 1500, cmuPatronale: 500, taxesPatronales: 2800, coutEmployeur: 116813 } })
    const url = BASE + "/api/notifications/traiter?tache=comptabilite&etablissement=" + E.id
    const refuse = await fetch(url, { method: "POST", headers: { "x-cron-secret": "mauvais-secret-0123456789" } })
    verifier(refuse.status === 401, "secret erroné refusé (statut " + refuse.status + ")")
    const ok = await fetch(url, { method: "POST", headers: { "x-cron-secret": CRON } })
    verifier(ok.status === 200, "appel accepté (statut " + ok.status + ")")
    const j = await ok.json()
    verifier(j.comptabilite && j.comptabilite.etablissements === 1 && j.comptabilite.ecritures === 1 && j.comptabilite.echecs === 0, "une écriture comptabilisée : " + JSON.stringify(j))
    verifier((await db.ecritureCompta.count({ where: { etablissementId: E.id, sourceType: "PAIE" } })) === 3, "trois écritures de paie")
    verifier((await desequilibres()).length === 0, "écritures équilibrées")
    const encore = await (await fetch(url, { method: "POST", headers: { "x-cron-secret": CRON } })).json()
    verifier(encore.comptabilite.ecritures === 0, "rejouable sans doublon")
    verifier(!!(await db.auditLog.findFirst({ where: { action: "COMPTA_AUTO", userEmail: "planificateur", entityId: E.id } })), "audit COMPTA_AUTO")
    const inconnue = await fetch(BASE + "/api/notifications/traiter?tache=zzz", { method: "POST", headers: { "x-cron-secret": CRON } })
    verifier(inconnue.status === 400, "tâche inconnue refusée")
  })

  await terminer(nettoyer, "PAIE", 0)
}

principal().catch(async (e) => {
  console.error("Echec : " + (e && e.message ? e.message : e))
  await terminer(nettoyer, "PAIE", 1)
})