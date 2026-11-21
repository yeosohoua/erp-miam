import "dotenv/config"
import { randomBytes } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"

import { PrismaPg } from "@prisma/adapter-pg"
import * as bcryptModule from "bcryptjs"
import Redis from "ioredis"
import { chromium } from "playwright"

import { PrismaClient } from "../src/generated/prisma/client.ts"
import { soldeConges } from "../src/lib/rh-avance-base.ts"

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

const PORT = 3122
const BASE = "http://localhost:" + PORT
const mdpHr = secret()
const mdpCompta = secret()
const mdpCaisse = secret()
const HR = "test-pe-rh@miam.test"
const COMPTA = "test-pe-compta@miam.test"
const CAISSE = "test-pe-caisse@miam.test"
const EMAILS = [HR, COMPTA, CAISSE]
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
  const E = await db.etablissement.create({ data: { code: "ZZ-PE", name: "ZZ Cantine Personnel", type: "SCHOOL", prepaye: true } })
  const E2 = await db.etablissement.create({ data: { code: "ZZ-PF", name: "ZZ Autre Personnel", type: "SCHOOL", prepaye: true } })
  const creerUser = (email, name, role, mdp) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  const uHr = await creerUser(HR, "Test Pe Rh", "HR", mdpHr)
  await creerUser(COMPTA, "Test Pe Compta", "ACCOUNTANT", mdpCompta)
  await creerUser(CAISSE, "Test Pe Caisse", "CASHIER", mdpCaisse)
  const embaucheE1 = iso(-420)
  const creerEmploye = (etab, matricule, prenom, nom, embauche, actif = true) =>
    db.employeRh.create({ data: { etablissementId: etab.id, matricule, firstName: prenom, lastName: nom, dateEmbauche: dateDb(embauche), salaireBase: 150000, actif } })
  const E1 = await creerEmploye(E, "ZZP-1", "Awa", "Kone", embaucheE1)
  const E2e = await creerEmploye(E, "ZZP-2", "Yao", "Kouame", iso(-1))
  await creerEmploye(E, "ZZP-3", "Inactif", "Depart", iso(-300), false)
  const EX = await creerEmploye(E2, "ZZP-X1", "Autre", "Etab", iso(-300))

  const dow = new Date(iso(0) + "T00:00:00Z").getUTCDay()
  const versLundi = ((8 - dow) % 7) || 7
  const j = (k) => iso(versLundi + k)

  process.env.CRON_SECRET = secret() + secret()
  await demarrer(BASE, PORT)
  const hr = await connecter(BASE, HR, mdpHr)
  const compta = await connecter(BASE, COMPTA, mdpCompta)
  const caisse = await connecter(BASE, CAISSE, mdpCaisse)
  const texte = (p, t) => p.getByText(t).filter({ visible: true }).first()
  const aller = async (p, chemin, testid) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
  }
  const kpi = (p, nom) => p.locator('[data-kpi="' + nom + '"]').first().innerText()
  const saisirConge = async (p, emp, type, debut, fin, motif = "") => {
    const f = p.locator('[data-testid="form-conge"]:visible')
    await f.evaluate((el) => { el.noValidate = true })
    await f.locator("#cg-employe").selectOption(emp)
    await f.locator("#cg-type").selectOption(type)
    await f.locator("#cg-debut").fill(debut)
    await f.locator("#cg-fin").fill(fin)
    await f.locator("#cg-motif").fill(motif)
    await f.getByRole("button", { name: "Demander" }).click()
  }
  const saisirPointage = async (p, emp, date, statut, retard = "", note = "") => {
    const f = p.locator('[data-testid="form-pointage"]:visible')
    await f.evaluate((el) => { el.noValidate = true })
    await f.locator("#pt-employe").selectOption(emp)
    await f.locator("#pt-date").fill(date)
    await f.locator("#pt-statut").selectOption(statut)
    await f.locator("#pt-retard").fill(retard)
    await f.locator("#pt-note").fill(note)
    await f.getByRole("button", { name: "Enregistrer" }).click()
  }
  const saisirCert = async (p, emp, type, delivree, expire, organisme = "") => {
    const f = p.locator('[data-testid="form-certification"]:visible')
    await f.evaluate((el) => { el.noValidate = true })
    await f.locator("#ce-employe").selectOption(emp)
    await f.locator("#ce-type").selectOption(type)
    await f.locator("#ce-delivree").fill(delivree)
    await f.locator("#ce-expire").fill(expire)
    await f.locator("#ce-organisme").fill(organisme)
    await f.getByRole("button", { name: "Ajouter" }).click()
  }

  await etape("Accès : RH, comptabilité en lecture ; le caissier n'a ni la page ni l'entrée de menu", async () => {
    await aller(hr, "/personnel", "personnel-page")
    verifier((await hr.locator('[data-testid="form-conge"]:visible').count()) === 1, "la RH voit le formulaire de congé")
    verifier((await hr.locator('[data-testid="menu-principal"] a[href="/personnel"]').count()) >= 1, "entrée de menu pour la RH")
    await aller(compta, "/personnel", "personnel-page")
    verifier((await compta.locator('[data-testid="form-conge"]:visible').count()) === 0, "le comptable ne voit pas le formulaire")
    await aller(caisse, "/personnel", "acces-refuse")
    verifier((await caisse.locator('[data-testid="personnel-page"]').count()) === 0, "le caissier n'accède pas à la page")
    verifier((await caisse.locator('[data-testid="menu-principal"] a[href="/personnel"]').count()) === 0, "pas d'entrée de menu pour le caissier")
  })

  await etape("Congés : refus (fin avant début, dimanche seul, employé absent, solde, chevauchement) puis demandes valides", async () => {
    await aller(hr, "/personnel?vue=conges", "personnel-page")
    await saisirConge(hr, E1.id, "ANNUEL", j(5), j(0))
    await texte(hr, "La fin ne peut pas précéder le début").waitFor()
    await saisirConge(hr, E1.id, "ANNUEL", j(6), j(6))
    await texte(hr, "Période invalide").waitFor()
    await saisirConge(hr, "", "ANNUEL", j(0), j(5))
    await texte(hr, "Employé introuvable ou inactif").waitFor()
    await saisirConge(hr, E1.id, "ANNUEL", j(30), j(120))
    await texte(hr, "Solde de congés insuffisant").waitFor()
    verifier((await db.conge.count({ where: { etablissementId: E.id } })) === 0, "rien n'est créé par les refus")
    await saisirConge(hr, E1.id, "ANNUEL", j(0), j(5), "Congés annuels")
    await texte(hr, "enregistrée pour ZZP-1 (6 jour").waitFor()
    await saisirConge(hr, E1.id, "PERMISSION", j(3), j(4))
    await texte(hr, "chevauche").waitFor()
    await saisirConge(hr, E2e.id, "ANNUEL", j(14), j(15))
    await texte(hr, "Solde de congés insuffisant").waitFor()
    await saisirConge(hr, E2e.id, "MALADIE", j(14), j(15), "Certificat médical")
    await texte(hr, "enregistrée pour ZZP-2").waitFor()
    const c1 = await db.conge.findFirst({ where: { employeId: E1.id } })
    verifier(c1 && c1.jours === 6 && c1.statut === "DEMANDE" && c1.type === "ANNUEL", "congé annuel de 6 jours en attente")
    verifier((await db.conge.count({ where: { etablissementId: E.id } })) === 2, "deux demandes")
  })

  await etape("Décision : approbation, refus, plus de boutons après décision, solde mis à jour, comptable sans boutons", async () => {
    await aller(compta, "/personnel?vue=conges", "personnel-page")
    verifier((await compta.getByRole("button", { name: "Approuver" }).count()) === 0, "le comptable n'a pas de bouton d'approbation")
    await aller(hr, "/personnel?vue=conges", "personnel-page")
    const c1 = await db.conge.findFirst({ where: { employeId: E1.id } })
    await hr.locator('tr[data-conge="' + c1.id + '"]').getByRole("button", { name: "Approuver" }).click()
    await attendre(async () => (await db.conge.findUnique({ where: { id: c1.id } })).statut === "APPROUVE", "congé approuvé")
    const apres = await db.conge.findUnique({ where: { id: c1.id } })
    verifier(apres.decidePar === uHr.id && !!apres.decideLe, "décideur et date enregistrés")
    await aller(hr, "/personnel?vue=conges", "personnel-page")
    verifier((await hr.locator('tr[data-conge="' + c1.id + '"]').getByRole("button").count()) === 0, "plus de bouton sur un congé décidé")
    const attendu = soldeConges(embaucheE1, iso(0), [{ type: "ANNUEL", statut: "APPROUVE", jours: 6 }]).disponible
    verifier((await hr.locator('tr[data-solde][data-matricule="ZZP-1"]').getAttribute("data-disponible")) === String(attendu), "solde disponible de ZZP-1 = " + attendu + " dixièmes")
    await saisirConge(hr, E1.id, "ANNUEL", j(14), j(19))
    await texte(hr, "enregistrée pour ZZP-1 (6 jour").waitFor()
    const c2 = await db.conge.findFirst({ where: { employeId: E1.id, statut: "DEMANDE" } })
    await aller(hr, "/personnel?vue=conges", "personnel-page")
    await hr.locator('tr[data-conge="' + c2.id + '"]').getByRole("button", { name: "Refuser" }).click()
    await attendre(async () => (await db.conge.findUnique({ where: { id: c2.id } })).statut === "REFUSE", "congé refusé")
    await aller(hr, "/personnel?vue=conges", "personnel-page")
    verifier((await hr.locator('tr[data-solde][data-matricule="ZZP-1"]').getAttribute("data-disponible")) === String(attendu), "un refus ne consomme pas de solde")
  })

  await etape("Présences : retard, remplacement du pointage du jour, dates et retards invalides refusés", async () => {
    await aller(hr, "/personnel?vue=presences", "personnel-page")
    await saisirPointage(hr, E1.id, iso(0), "RETARD", "15", "Embouteillage")
    await texte(hr, "Pointage enregistré pour ZZP-1").waitFor()
    await saisirPointage(hr, E1.id, iso(0), "ABSENT")
    await attendre(async () => (await db.pointage.findFirst({ where: { employeId: E1.id, date: dateDb(iso(0)) } }))?.statut === "ABSENT", "pointage remplacé")
    verifier((await db.pointage.count({ where: { employeId: E1.id, date: dateDb(iso(0)) } })) === 1, "un seul pointage par jour")
    verifier((await db.pointage.findFirst({ where: { employeId: E1.id } })).minutesRetard === 0, "le retard est remis à zéro")
    await saisirPointage(hr, E1.id, iso(1), "PRESENT")
    await texte(hr, "Date invalide").waitFor()
    await saisirPointage(hr, E1.id, iso(0), "RETARD", "0")
    await texte(hr, "Retard invalide").waitFor()
    await saisirPointage(hr, E1.id, iso(-500), "PRESENT")
    await texte(hr, "antérieure à l'embauche").waitFor()
    await saisirPointage(hr, E2e.id, iso(0), "RETARD", "20")
    await texte(hr, "Pointage enregistré pour ZZP-2").waitFor()
    await aller(hr, "/personnel?vue=presences", "personnel-page")
    verifier(/\b1\b/.test(await kpi(hr, "presents-jour")), "un présent aujourd'hui (le retardataire compte)")
    verifier(/\b1\b/.test(await kpi(hr, "absents-jour")), "un absent aujourd'hui")
    verifier(/\b20\b/.test(await kpi(hr, "retards-mois")), "20 minutes de retard dans le mois")
    verifier((await hr.locator('tr[data-pointage][data-matricule="ZZP-1"][data-date="' + iso(0) + '"][data-statut="ABSENT"]').count()) === 1, "le dernier pointage de ZZP-1 est listé")
  })

  await etape("Certifications : statuts valide / bientôt / expirée, refus et suppression", async () => {
    await aller(hr, "/personnel?vue=certifications", "personnel-page")
    await saisirCert(hr, E1.id, "HACCP", iso(-300), iso(20), "Bureau Veritas")
    await attendre(async () => (await db.certification.count({ where: { etablissementId: E.id } })) === 1, "certification 1 enregistrée")
    await saisirCert(hr, E1.id, "VISITE_MEDICALE", iso(-400), iso(-1))
    await attendre(async () => (await db.certification.count({ where: { etablissementId: E.id } })) === 2, "certification 2 enregistrée")
    await saisirCert(hr, E1.id, "PREMIERS_SECOURS", iso(-10), iso(355))
    await attendre(async () => (await db.certification.count({ where: { etablissementId: E.id } })) === 3, "certification 3 enregistrée")
    await saisirCert(hr, E1.id, "FORMATION_HYGIENE", iso(-5), iso(-5))
    await texte(hr, "L'expiration doit suivre la délivrance").waitFor()
    await saisirCert(hr, E1.id, "HACCP", iso(-300), iso(60))
    await texte(hr, "déjà enregistrée").waitFor()
    verifier((await db.certification.count({ where: { etablissementId: E.id } })) === 3, "trois certifications")
    await aller(hr, "/personnel?vue=certifications", "personnel-page")
    const st = (t) => hr.locator('tr[data-certification][data-type="' + t + '"]').getAttribute("data-statut")
    verifier((await st("HACCP")) === "BIENTOT" && (await st("VISITE_MEDICALE")) === "EXPIREE" && (await st("PREMIERS_SECOURS")) === "VALIDE", "statuts bientôt / expirée / valide")
    verifier(/\b1\b/.test(await kpi(hr, "cert-expirees")) && /\b1\b/.test(await kpi(hr, "cert-bientot")), "compteurs d'alerte")
    await hr.locator('tr[data-certification][data-type="VISITE_MEDICALE"]').getByRole("button", { name: "Supprimer" }).click()
    await attendre(async () => (await db.certification.count({ where: { etablissementId: E.id } })) === 2, "certification supprimée")
  })

  await etape("Audit, isolation entre établissements", async () => {
    for (const action of ["CONGE_DEMANDE", "CONGE_APPROUVE", "CONGE_REFUSE", "POINTAGE_ENREGISTRE", "CERTIFICATION_AJOUTEE", "CERTIFICATION_SUPPRIMEE"]) {
      verifier(!!(await db.auditLog.findFirst({ where: { action, userEmail: HR } })), "audit " + action)
    }
    await aller(hr, "/personnel?vue=conges", "personnel-page")
    verifier((await hr.locator('#cg-employe option[value="' + EX.id + '"]').count()) === 0, "l'employé de l'autre établissement n'est pas proposé")
    verifier((await hr.locator('tr[data-matricule="ZZP-X1"]').count()) === 0, "aucune ligne de l'autre établissement")
    verifier((await hr.locator('#cg-employe option').filter({ hasText: "ZZP-3" }).count()) === 0, "l'employé inactif n'est pas proposé")
    verifier((await db.conge.count({ where: { etablissementId: E2.id } })) === 0 && (await db.pointage.count({ where: { etablissementId: E2.id } })) === 0 && (await db.certification.count({ where: { etablissementId: E2.id } })) === 0, "rien dans l'autre établissement")
  })

  await terminer(nettoyer, "PERSONNEL", 0)
}

principal().catch(async (e) => {
  console.error("Echec : " + (e && e.message ? e.message : e))
  await terminer(nettoyer, "PERSONNEL", 1)
})