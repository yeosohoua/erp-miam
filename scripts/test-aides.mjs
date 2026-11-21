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

const PORT = 3121
const BASE = "http://localhost:" + PORT
const mdpGest = secret()
const mdpCaisse = secret()
const GEST = "test-ai-gest@miam.test"
const CAISSE = "test-ai-caisse@miam.test"
const EMAILS = [GEST, CAISSE]
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
  const E = await db.etablissement.create({ data: { code: "ZZ-AI", name: "ZZ Cantine Aides", type: "SCHOOL", prepaye: true } })
  const E2 = await db.etablissement.create({ data: { code: "ZZ-AJ", name: "ZZ Autre Aides", type: "SCHOOL", prepaye: true } })
  await db.tarif.create({ data: { etablissementId: E.id, service: "LUNCH", prix: 600 } })
  const creerUser = (email, name, role, mdp) => db.user.create({ data: { email, name, role, passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  await creerUser(GEST, "Test Ai Gest", "MANAGER", mdpGest)
  await creerUser(CAISSE, "Test Ai Caisse", "CASHIER", mdpCaisse)
  const I = {}
  for (let n = 1; n <= 9; n++) {
    I[n] = await db.inscrit.create({ data: { etablissementId: E.id, matricule: "ZZA-" + n, firstName: "Prenom" + n, lastName: "Nom" + n, badge: "ZZAIDEBADGE-" + n, solde: n <= 7 ? 5000 : 0, statut: n === 8 ? "SUSPENDED" : "ACTIVE" } })
  }
  const X = await db.inscrit.create({ data: { etablissementId: E2.id, matricule: "ZZA-X1", firstName: "Autre", lastName: "Etab", badge: "ZZAIDEBADGE-X1", solde: 7000 } })
  await db.aide.create({ data: { etablissementId: E2.id, nom: "ZZ Aide Autre", type: "GRATUIT", valeur: 0 } })
  await db.menu.create({ data: { etablissementId: E.id, date: dateDb(iso(0)), service: "LUNCH", statut: "PUBLISHED" } })
  await db.reservation.createMany({ data: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ etablissementId: E.id, inscritId: I[n].id, date: dateDb(iso(0)), service: "LUNCH", statut: "BOOKED" })) })

  process.env.CRON_SECRET = secret() + secret()
  await demarrer(BASE, PORT)
  const gest = await connecter(BASE, GEST, mdpGest)
  const caisse = await connecter(BASE, CAISSE, mdpCaisse)
  const texte = (p, t) => p.getByText(t).filter({ visible: true }).first()
  const aller = async (p, chemin, testid) => {
    await p.goto(BASE + chemin, { waitUntil: "load" })
    await p.waitForLoadState("networkidle").catch(() => {})
    await p.locator('[data-testid="' + testid + '"]:visible').waitFor()
  }
  const solde = async (n) => (await db.inscrit.findUnique({ where: { id: I[n].id } })).solde
  const resa = (n) => db.reservation.findFirst({ where: { inscritId: I[n].id, date: dateDb(iso(0)), service: "LUNCH" } })
  const saisirAide = async (p, nom, type, valeur) => {
    const f = p.locator('[data-testid="form-aide"]:visible')
    await f.evaluate((el) => { el.noValidate = true })
    await f.locator("#ai-nom").fill(nom)
    await f.locator("#ai-type").selectOption(type)
    await f.locator("#ai-valeur").fill(valeur)
    await f.getByRole("button", { name: "Créer l'aide" }).click()
  }
  const attribuer = async (p, ident, aideNom, debut, fin, motif) => {
    const f = p.locator('[data-testid="form-attribution"]:visible')
    await f.evaluate((el) => { el.noValidate = true })
    await f.locator("#at-identifiant").fill(ident)
    await f.locator("#at-aide").selectOption({ label: aideNom })
    await f.locator("#at-debut").fill(debut)
    await f.locator("#at-fin").fill(fin)
    await f.locator("#at-motif").fill(motif)
    await f.getByRole("button", { name: "Attribuer" }).click()
  }
  const ligneResa = (p, n) => p.locator('[data-service="LUNCH"] tr[data-matricule="ZZA-' + n + '"]')
  const pointer = (p, n) => ligneResa(p, n).getByRole("button", { name: "Pointer" }).click()
  const annulerPointage = (p, n) => ligneResa(p, n).getByRole("button", { name: "Annuler le pointage" }).click()

  await etape("Accès : gestionnaire seulement ; le caissier n'a ni la page ni l'entrée de menu", async () => {
    await aller(gest, "/aides", "aides-page")
    verifier((await gest.locator('[data-testid="form-aide"]:visible').count()) === 1, "le gestionnaire voit le formulaire")
    verifier((await gest.locator('[data-testid="menu-principal"] a[href="/aides"]').count()) >= 1, "entrée de menu Aides sociales")
    await aller(caisse, "/aides", "acces-refuse")
    verifier((await caisse.locator('[data-testid="aides-page"]').count()) === 0, "le caissier n'accède pas aux aides")
    verifier((await caisse.locator('[data-testid="menu-principal"] a[href="/aides"]').count()) === 0, "pas d'entrée de menu pour le caissier")
  })

  await etape("Création : nom, pourcentage et montant invalides refusés, trois aides créées, doublon refusé", async () => {
    await aller(gest, "/aides", "aides-page")
    await saisirAide(gest, "A", "POURCENTAGE", "50")
    await texte(gest, "2 caractères au moins").waitFor()
    await saisirAide(gest, "ZZ Bourse 50", "POURCENTAGE", "101")
    await texte(gest, "Pourcentage invalide").waitFor()
    await saisirAide(gest, "ZZ Social 200", "MONTANT", "0")
    await texte(gest, "Montant invalide").waitFor()
    verifier((await db.aide.count({ where: { etablissementId: E.id } })) === 0, "rien n'est créé par les refus")
    await saisirAide(gest, "ZZ Bourse 50", "POURCENTAGE", "50")
    await texte(gest, "ZZ Bourse 50 créée").waitFor()
    await saisirAide(gest, "ZZ Social 200", "MONTANT", "200")
    await texte(gest, "ZZ Social 200 créée").waitFor()
    await saisirAide(gest, "ZZ Gratuit", "GRATUIT", "")
    await texte(gest, "ZZ Gratuit créée").waitFor()
    await saisirAide(gest, "ZZ Bourse 50", "POURCENTAGE", "30")
    await texte(gest, "Une aide porte déjà ce nom").waitFor()
    verifier((await db.aide.count({ where: { etablissementId: E.id } })) === 3, "trois aides")
    const g = await db.aide.findFirst({ where: { etablissementId: E.id, nom: "ZZ Gratuit" } })
    verifier(g && g.type === "GRATUIT" && g.valeur === 0, "la gratuité est enregistrée avec la valeur 0")
  })

  await etape("Attribution : inscrit inconnu, période inversée, inscrit suspendu et doublon refusés ; attributions valides", async () => {
    await aller(gest, "/aides", "aides-page")
    await attribuer(gest, "ZZA-404", "ZZ Bourse 50", iso(0), "", "")
    await texte(gest, "Inscrit introuvable").waitFor()
    await attribuer(gest, "ZZA-1", "ZZ Bourse 50", iso(0), iso(-1), "")
    await texte(gest, "La fin ne peut pas précéder le début").waitFor()
    await attribuer(gest, "ZZA-8", "ZZ Bourse 50", iso(0), "", "")
    await texte(gest, "n'est pas actif").waitFor()
    verifier((await db.aideInscrit.count({ where: { etablissementId: E.id } })) === 0, "rien n'est attribué par les refus")
    await attribuer(gest, "ZZA-1", "ZZ Bourse 50", iso(0), "", "Major de classe")
    await texte(gest, "attribuée à ZZA-1").waitFor()
    await attribuer(gest, "ZZA-1", "ZZ Bourse 50", iso(0), "", "")
    await texte(gest, "déjà attribuée").waitFor()
    await attribuer(gest, "ZZA-2", "ZZ Social 200", iso(0), "", "Dossier social")
    await texte(gest, "attribuée à ZZA-2").waitFor()
    await attribuer(gest, "ZZAIDEBADGE-3", "ZZ Gratuit", iso(0), "", "Pupille")
    await texte(gest, "attribuée à ZZA-3").waitFor()
    await attribuer(gest, "ZZA-5", "ZZ Bourse 50", iso(-5), iso(-1), "Bourse terminée")
    await texte(gest, "attribuée à ZZA-5").waitFor()
    await attribuer(gest, "ZZA-6", "ZZ Bourse 50", iso(1), "", "Effective demain")
    await texte(gest, "attribuée à ZZA-6").waitFor()
    await attribuer(gest, "ZZA-7", "ZZ Social 200", iso(0), "", "Dossier social")
    await texte(gest, "attribuée à ZZA-7").waitFor()
    verifier((await db.aideInscrit.count({ where: { etablissementId: E.id } })) === 6, "six attributions")
    await aller(gest, "/aides", "aides-page")
    const actif = (n) => gest.locator('tr[data-attribution][data-matricule="ZZA-' + n + '"]').first().getAttribute("data-active")
    verifier((await actif(1)) === "true" && (await actif(2)) === "true" && (await actif(3)) === "true" && (await actif(7)) === "true", "attributions en cours")
    verifier((await actif(5)) === "false" && (await actif(6)) === "false", "attribution terminée et attribution à venir non actives")
    const k = await gest.locator('[data-kpi="beneficiaires"]').innerText()
    verifier(/(^|\s)4(\s|$)/.test(k), "quatre bénéficiaires aujourd'hui (obtenu : " + k.replace(/\s+/g, " ") + ")")
  })

  await etape("Débit : prix réduit par la meilleure aide, gratuité sans débit, aide terminée ou à venir sans effet", async () => {
    await aller(caisse, "/reservations", "jour")
    for (const n of [1, 2, 3, 4, 5, 6]) {
      await pointer(caisse, n)
      await attendre(async () => !!(await resa(n))?.servedAt, "ZZA-" + n + " pointé")
    }
    verifier((await solde(1)) === 4700, "50 % de 600 : solde 4700 (obtenu " + (await solde(1)) + ")")
    verifier((await solde(2)) === 4600, "200 FCFA d'aide : 400 débités, solde 4600 (obtenu " + (await solde(2)) + ")")
    verifier((await solde(3)) === 5000, "gratuité : solde inchangé")
    verifier((await db.transaction.count({ where: { inscritId: I[3].id, type: "DEBIT" } })) === 0, "gratuité : aucun débit créé")
    verifier((await solde(4)) === 4400 && (await solde(5)) === 4400 && (await solde(6)) === 4400, "sans aide, aide terminée, aide à venir : 600 débités")
    const d1 = await db.transaction.findFirst({ where: { inscritId: I[1].id, type: "DEBIT" } })
    verifier(d1 && d1.montant === -300 && d1.note.includes("aide ZZ Bourse 50"), "débit de 300 avec l'aide mentionnée")
    const d2 = await db.transaction.findFirst({ where: { inscritId: I[2].id, type: "DEBIT" } })
    verifier(d2 && d2.montant === -400 && d2.note.includes("aide ZZ Social 200"), "débit de 400 avec l'aide mentionnée")
    const d4 = await db.transaction.findFirst({ where: { inscritId: I[4].id, type: "DEBIT" } })
    verifier(d4 && d4.montant === -600 && !d4.note.includes("aide"), "plein tarif sans mention d'aide")
  })

  await etape("Annulation du pointage : remboursement exact du montant réellement débité", async () => {
    await aller(caisse, "/reservations", "jour")
    await annulerPointage(caisse, 1)
    await attendre(async () => (await solde(1)) === 5000, "ZZA-1 remboursé de 300")
    verifier((await db.transaction.count({ where: { inscritId: I[1].id, type: "REFUND", montant: 300 } })) === 1, "remboursement de 300 (et non de 600)")
    await annulerPointage(caisse, 3)
    await attendre(async () => !(await resa(3))?.servedAt, "pointage gratuit annulé")
    verifier((await solde(3)) === 5000 && (await db.transaction.count({ where: { inscritId: I[3].id, type: "REFUND" } })) === 0, "gratuité : rien à rembourser")
    await aller(caisse, "/reservations", "jour")
    await pointer(caisse, 1)
    await attendre(async () => (await solde(1)) === 4700, "ZZA-1 débité de 300 à nouveau")
    await pointer(caisse, 3)
    await attendre(async () => !!(await resa(3))?.servedAt, "ZZA-3 pointé à nouveau")
    verifier((await solde(3)) === 5000, "gratuité : toujours aucun débit")
  })

  await etape("Fin d'aide, retrait d'une aide à venir, désactivation : l'effet est immédiat", async () => {
    await aller(gest, "/aides", "aides-page")
    const at1 = await db.aideInscrit.findFirst({ where: { inscritId: I[1].id } })
    await gest.locator('tr[data-attribution="' + at1.id + '"]').getByRole("button", { name: "Terminer" }).click()
    await attendre(async () => (await db.aideInscrit.findUnique({ where: { id: at1.id } })).fin?.toISOString().slice(0, 10) === iso(0), "fin positionnée à aujourd'hui")
    const at6 = await db.aideInscrit.findFirst({ where: { inscritId: I[6].id } })
    await aller(gest, "/aides", "aides-page")
    await gest.locator('tr[data-attribution="' + at6.id + '"]').getByRole("button", { name: "Retirer" }).click()
    await attendre(async () => (await db.aideInscrit.count({ where: { id: at6.id } })) === 0, "attribution à venir retirée")
    await aller(gest, "/aides", "aides-page")
    await gest.locator('tr[data-aide][data-nom="ZZ Social 200"]').getByRole("button", { name: "Désactiver" }).click()
    await attendre(async () => (await db.aide.findFirst({ where: { etablissementId: E.id, nom: "ZZ Social 200" } })).active === false, "aide désactivée")
    await aller(caisse, "/reservations", "jour")
    await pointer(caisse, 7)
    await attendre(async () => !!(await resa(7))?.servedAt, "ZZA-7 pointé")
    verifier((await solde(7)) === 4400, "aide désactivée : plein tarif de 600 (obtenu " + (await solde(7)) + ")")
  })

  await etape("Audit, isolation entre établissements et cohérence des soldes", async () => {
    for (const action of ["AIDE_CREE", "AIDE_ATTRIBUEE", "AIDE_TERMINEE", "AIDE_RETIREE", "AIDE_DESACTIVEE"]) {
      verifier(!!(await db.auditLog.findFirst({ where: { action, userEmail: GEST } })), "audit " + action)
    }
    await aller(gest, "/aides", "aides-page")
    verifier((await gest.locator('tr[data-aide][data-nom="ZZ Aide Autre"]').count()) === 0, "l'aide de l'autre établissement est invisible")
    verifier((await db.aideInscrit.count({ where: { etablissementId: E2.id } })) === 0, "aucune attribution dans l'autre établissement")
    verifier((await db.inscrit.findUnique({ where: { id: X.id } })).solde === 7000, "solde de l'autre établissement intact")
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      const agg = await db.transaction.aggregate({ where: { inscritId: I[n].id }, _sum: { montant: true } })
      verifier(5000 + (agg._sum.montant ?? 0) === (await solde(n)), "solde de ZZA-" + n + " cohérent avec ses mouvements")
    }
  })

  await terminer(nettoyer, "AIDES", 0)
}

principal().catch(async (e) => {
  console.error("Echec : " + (e && e.message ? e.message : e))
  await terminer(nettoyer, "AIDES", 1)
})