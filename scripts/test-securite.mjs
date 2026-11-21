import "dotenv/config"
import { randomBytes } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"

import { PrismaPg } from "@prisma/adapter-pg"
import * as bcryptModule from "bcryptjs"
import Redis from "ioredis"
import { chromium } from "playwright"

import { PrismaClient } from "../src/generated/prisma/client.ts"
import { codeTotp, pasCourant } from "../src/lib/totp.ts"

const bcrypt = bcryptModule.default ?? bcryptModule
const PORT = 3104
const BASE = "http://localhost:" + PORT
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const redis = new Redis(process.env.REDIS_URL)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const secret = () => randomBytes(8).toString("hex") + "Zz9"
const mdpAdmin = secret()
const mdpMgr = secret()
const ADMIN_EMAIL = "test-sv-admin@miam.test"
const MGR_EMAIL = "test-sv-mgr@miam.test"
const EMAILS = [ADMIN_EMAIL, MGR_EMAIL]

let serveur = null
let navigateur = null
let mgrId = null
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

async function loginMotDePasse(email, mdp) {
  const p = await nouvellePage()
  await ouvrir("/login", p)
  await p.locator('input[name="email"]').fill(email)
  await p.locator('input[name="password"]').fill(mdp)
  await p.locator('button[type="submit"]').first().click()
  await cheminAttendu(p, "/login/verification", "défi de second facteur")
  await p.locator("#code-2fa").waitFor()
  return p
}

const saisirCode = async (p, code) => {
  await p.locator("#code-2fa").fill(code)
  await p.getByRole("button", { name: "Valider" }).click()
}
const cheminAttendu = (p, chemin, message) => attendre(() => new URL(p.url()).pathname === chemin, message)
const alerte = (p, texte) => p.locator('p[role="alert"]').filter({ hasText: texte }).waitFor()
const statut = (p, texte) => p.locator('[role="status"]').filter({ hasText: texte }).waitFor()

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { OR: [{ userEmail: { in: EMAILS } }, { details: { contains: "ZZ" } }] } })
  await db.user.deleteMany({ where: { email: { in: EMAILS } } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  for (const e of EMAILS) await redis.del("rl:fail:" + e, "rl:blk:" + e)
  if (mgrId) {
    const k = mgrId.toLowerCase()
    await redis.del("rl:fail:2fa:" + k, "rl:blk:2fa:" + k, "rl:fail:pwd:" + k, "rl:blk:pwd:" + k, "rl:fail:tfa-setup:" + k, "rl:blk:tfa-setup:" + k)
  }
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  await db.user.create({ data: { email: ADMIN_EMAIL, name: "Test Sv Admin", role: "ADMIN", passwordHash: bcrypt.hashSync(mdpAdmin, 10), active: true } })
  const mgr = await db.user.create({ data: { email: MGR_EMAIL, name: "Test Sv Mgr", role: "MANAGER", passwordHash: bcrypt.hashSync(mdpMgr, 10), active: true } })
  mgrId = mgr.id

  serveur = spawn("npx", ["next", "start", "-p", String(PORT)], { shell: true, cwd: process.cwd(), env: process.env, stdio: "ignore" })
  await attendre(async () => {
    try {
      return (await fetch(BASE + "/api/sante")).ok
    } catch {
      return false
    }
  }, "demarrage du serveur", 60000)
  navigateur = await chromium.launch()

  let secretTotp = ""
  let codes = []
  const k2fa = "2fa:" + mgrId.toLowerCase()

  await etape("2FA : activation (code incorrect refusé, code valide accepté, QR, codes de secours, secret chiffré)", async () => {
    const m = await connecter(MGR_EMAIL, mdpMgr)
    await ouvrir("/compte", m)
    await m.getByRole("button", { name: "Activer la double authentification", exact: true }).click()
    await m.locator('[data-testid="secret-2fa"]').waitFor()
    secretTotp = (await m.locator('[data-testid="secret-2fa"]').innerText()).trim()
    verifier(/^[A-Z2-7]{32}$/.test(secretTotp), "clé base32 de 32 caractères")
    verifier((await m.locator('[data-testid="qr-2fa"] svg').count()) === 1, "code QR affiché")
    await m.locator("#tfa-code").fill("000000")
    await m.getByRole("button", { name: "Confirmer et activer" }).click()
    await alerte(m, "Code incorrect")
    await m.locator("#tfa-code").fill(codeTotp(secretTotp, pasCourant()))
    await m.getByRole("button", { name: "Confirmer et activer" }).click()
    await m.locator('[data-testid="codes-secours"]').waitFor()
    codes = (await m.locator('[data-testid="codes-secours"] li').allInnerTexts()).map((c) => c.trim())
    verifier(codes.length === 8 && codes.every((c) => /^[0-9A-F]{5}-[0-9A-F]{5}$/.test(c)), "8 codes de secours au bon format")
    const u = await db.user.findUnique({ where: { email: MGR_EMAIL } })
    verifier(u.totpEnabled && u.recoveryCodes.length === 8 && !!u.totpSecret && !u.totpSecret.includes(secretTotp), "2FA active, secret chiffré, codes hachés")
    verifier(!u.recoveryCodes.includes(codes[0]), "les codes de secours ne sont pas stockés en clair")
    await ouvrir("/compte", m)
    verifier(new URL(m.url()).pathname === "/compte", "la session courante est conservée")
    await m.context().close()
  })

  await etape("Connexion avec 2FA : mot de passe seul insuffisant, mauvais code refusé, bon code accepté, rejeu refusé", async () => {
    const p = await loginMotDePasse(MGR_EMAIL, mdpMgr)
    await p.goto(BASE + "/", { waitUntil: "load" })
    await cheminAttendu(p, "/login", "pas de session avec le mot de passe seul")
    await ouvrir("/login/verification", p)
    await saisirCode(p, "000000")
    await alerte(p, "Code incorrect")
    const dernier = (await db.user.findUnique({ where: { email: MGR_EMAIL } })).totpLastStep
    const code = codeTotp(secretTotp, Math.max(dernier + 1, pasCourant()))
    await saisirCode(p, code)
    await cheminAttendu(p, "/", "connexion avec le bon code")
    await p.locator('[data-testid="menu-principal"]').waitFor()
    const q = await loginMotDePasse(MGR_EMAIL, mdpMgr)
    await saisirCode(q, code)
    await alerte(q, "Code incorrect")
    await q.context().close()
    await p.context().close()
  })

  let session
  await etape("Codes de secours : un code ouvre la session une seule fois", async () => {
    const r = await loginMotDePasse(MGR_EMAIL, mdpMgr)
    await saisirCode(r, codes[0])
    await cheminAttendu(r, "/", "connexion avec un code de secours")
    await r.locator('[data-testid="menu-principal"]').waitFor()
    verifier((await db.user.findUnique({ where: { email: MGR_EMAIL } })).recoveryCodes.length === 7, "le code utilisé est consommé")
    const r2 = await loginMotDePasse(MGR_EMAIL, mdpMgr)
    await saisirCode(r2, codes[0])
    await alerte(r2, "Code incorrect")
    await r2.context().close()
    session = r
  })

  let nouveaux = []
  await etape("Régénération des codes : mot de passe exigé, anciens codes invalidés", async () => {
    await ouvrir("/compte", session)
    await session.locator("#tfa-reg-mdp").fill("mauvais-mot-de-passe-1")
    await session.getByRole("button", { name: "Régénérer les codes de secours" }).click()
    await alerte(session, "Mot de passe incorrect")
    await session.locator("#tfa-reg-mdp").fill(mdpMgr)
    await session.getByRole("button", { name: "Régénérer les codes de secours" }).click()
    await session.locator('[data-testid="codes-secours"]').waitFor()
    nouveaux = (await session.locator('[data-testid="codes-secours"] li').allInnerTexts()).map((c) => c.trim())
    verifier(nouveaux.length === 8 && nouveaux[0] !== codes[0], "8 nouveaux codes")
    verifier((await db.user.findUnique({ where: { email: MGR_EMAIL } })).recoveryCodes.length === 8, "8 codes enregistrés")
  })

  await etape("Anti force brute : blocage Redis après échecs, même avec un code de secours valide", async () => {
    const p = await loginMotDePasse(MGR_EMAIL, mdpMgr)
    const fail = "rl:fail:" + k2fa
    const blk = "rl:blk:" + k2fa
    for (let i = 0; i < 8; i++) {
      if (await redis.exists(blk)) break
      const avant = Number((await redis.get(fail)) ?? 0)
      await saisirCode(p, "111111")
      await attendre(async () => Number((await redis.get(fail)) ?? 0) > avant || (await redis.exists(blk)), "échec compté")
    }
    verifier(!!(await redis.exists(blk)), "blocage stocké dans Redis")
    await saisirCode(p, nouveaux[0])
    await alerte(p, "Trop de tentatives")
    await p.context().close()
  })

  await etape("Réinitialisation par l'administrateur : 2FA retirée, sessions coupées", async () => {
    const admin = await connecter(ADMIN_EMAIL, mdpAdmin)
    await ouvrir("/parametres/utilisateurs/" + mgrId, admin)
    await admin.getByRole("button", { name: "Réinitialiser la 2FA" }).click()
    await attendre(async () => {
      const u = await db.user.findUnique({ where: { id: mgrId } })
      return !u.totpEnabled && u.totpSecret === null && u.recoveryCodes.length === 0
    }, "2FA réinitialisée")
    await session.goto(BASE + "/", { waitUntil: "load" })
    await cheminAttendu(session, "/login", "session du responsable coupée")
    await session.context().close()
    await admin.context().close()
  })

  await etape("Droits : un responsable ne peut ni exporter, ni voir les sauvegardes, ni le journal", async () => {
    const m = await connecter(MGR_EMAIL, mdpMgr)
    const rep = await m.context().request.get(BASE + "/api/sauvegarde")
    verifier(rep.status() === 403, "export refusé (403), reçu " + rep.status())
    await m.goto(BASE + "/parametres/sauvegardes", { waitUntil: "load" })
    await cheminAttendu(m, "/parametres", "sauvegardes réservées à l'administrateur")
    await m.goto(BASE + "/parametres/audit", { waitUntil: "load" })
    await cheminAttendu(m, "/parametres", "journal réservé à l'administrateur")
    await m.context().close()
  })

  const admin = await connecter(ADMIN_EMAIL, mdpAdmin)

  await etape("Journal d'audit : filtre par action, par utilisateur, accès administrateur", async () => {
    await ouvrir("/parametres/audit?action=TWO_FACTOR_ENABLED", admin)
    await admin.locator('[data-testid="table-audit"]').waitFor()
    verifier((await admin.locator('tbody tr[data-action="TWO_FACTOR_ENABLED"]').count()) >= 1, "évènement d'activation de la 2FA présent")
    verifier((await admin.locator('tbody tr:not([data-action="TWO_FACTOR_ENABLED"])').count()) === 0, "filtre par action respecté")
    await ouvrir("/parametres/audit?q=test-sv-mgr", admin)
    await admin.locator('[data-testid="table-audit"]').waitFor()
    verifier((await admin.locator("tbody tr").count()) >= 3, "recherche par utilisateur")
    await ouvrir("/parametres/audit?action=ACTION_QUI_NEXISTE_PAS", admin)
    await admin.locator('[data-testid="aucun-evenement"]').waitFor()
  })

  await etape("Sauvegarde : export complet, fichier invalide / mot de passe / confirmation refusés, restauration exacte", async () => {
    const S = await db.etablissement.create({ data: { code: "ZZ-SV", name: "ZZ Sauvegarde", type: "OTHER" } })
    await db.inscrit.create({ data: { etablissementId: S.id, matricule: "ZZSV-001", firstName: "Sauv", lastName: "Egarde", badge: "ZZSV000000000001" } })
    const platSv = await db.plat.create({ data: { etablissementId: S.id, name: "ZZ Plat Sv", portions: 2 } })
    await db.menu.create({ data: { etablissementId: S.id, date: new Date("2030-01-07T00:00:00.000Z"), service: "LUNCH", plats: { create: [{ platId: platSv.id }] } } })
    const inscSv = await db.inscrit.findFirst({ where: { matricule: "ZZSV-001" } })
    await db.reservation.create({ data: { etablissementId: S.id, inscritId: inscSv.id, date: new Date("2030-01-07T00:00:00.000Z"), service: "LUNCH", servedAt: new Date() } })
    const empSv = await db.employeRh.create({ data: { etablissementId: S.id, matricule: "ZZSV-E1", firstName: "Paie", lastName: "Sauv", dateEmbauche: new Date("2024-02-01T00:00:00.000Z"), salaireBase: 200000 } })
    await db.parametresPaie.create({ data: { etablissementId: S.id, atBp: 300, cnpsDeductibleIts: true } })
    const bulletinSv = { etablissementId: S.id, employeId: empSv.id, brut: 200000, partsX2: 2, baseIts: 187400, its: 22000, retraiteSalarie: 12600, cmuSalarie: 500, net: 164900, retraitePatronale: 15400, pf: 3750, maternite: 563, at: 2250, cmuPatronale: 500, taxesPatronales: 5600, coutEmployeur: 228063 }
    await db.bulletinPaie.create({ data: { ...bulletinSv, periode: "2030-01", statut: "VALIDATED", valideLe: new Date("2030-02-01T10:00:00.000Z") } })
    await db.bulletinPaie.create({ data: { ...bulletinSv, periode: "2030-02", statut: "DRAFT" } })

    const rep = await admin.context().request.get(BASE + "/api/sauvegarde")
    verifier(rep.status() === 200, "export accepté (200)")
    verifier((rep.headers()["content-disposition"] ?? "").includes("attachment"), "téléchargement en pièce jointe")
    const texte = await rep.text()
    const json = JSON.parse(texte)
    verifier(json.format === "erp-miam-sauvegarde" && json.version === 2, "format de sauvegarde complet (version 2)")
    const toutes = Object.values(json.tables).flat()
    verifier(toutes.some((i) => i.matricule === "ZZSV-001") && json.tables.users.some((u) => u.email === ADMIN_EMAIL), "contenu de la sauvegarde")
    const empSauv = toutes.find((e) => e.matricule === "ZZSV-E1")
    verifier(!!empSauv && toutes.filter((b) => b.employeId === empSauv.id && b.net === 164900).length === 2 && toutes.some((x) => x.atBp === 300), "tables de paie présentes dans la sauvegarde")

    await db.inscrit.deleteMany({ where: { matricule: "ZZSV-001" } })
    await db.menu.deleteMany({ where: { etablissementId: S.id } })
    await db.plat.deleteMany({ where: { etablissementId: S.id } })
    await db.employeRh.deleteMany({ where: { matricule: "ZZSV-E1" } })
    await db.parametresPaie.deleteMany({ where: { etablissementId: S.id } })
    await db.inscrit.create({ data: { etablissementId: S.id, matricule: "ZZSV-002", firstName: "Apres", lastName: "Sauvegarde", badge: "ZZSV000000000002" } })

    await ouvrir("/parametres/sauvegardes", admin)
    const fichier = (contenu) => admin.locator("#restore-fichier").setInputFiles({ name: "sauvegarde.json", mimeType: "application/json", buffer: Buffer.from(contenu) })
    const lancer = () => admin.getByRole("button", { name: "Restaurer la sauvegarde" }).click()

    await fichier(texte)
    await admin.locator("#restore-mdp").fill(mdpAdmin)
    await admin.locator("#restore-confirm").fill("oui")
    await lancer()
    await alerte(admin, "RESTAURER")

    await admin.locator("#restore-confirm").fill("RESTAURER")
    await admin.locator("#restore-mdp").fill("mauvais-mot-de-passe-1")
    await lancer()
    await alerte(admin, "incorrect")

    await admin.locator("#restore-mdp").fill(mdpAdmin)
    await fichier("ceci n'est pas du json")
    await lancer()
    await alerte(admin, "invalide")
    verifier(!!(await db.inscrit.findFirst({ where: { matricule: "ZZSV-002" } })), "rien n'est modifié par un fichier invalide")

    await fichier(texte)
    await lancer()
    await statut(admin, "Restauration terminée")
    verifier(!!(await db.inscrit.findFirst({ where: { matricule: "ZZSV-001" } })), "ZZSV-001 restauré")
    verifier(!(await db.inscrit.findFirst({ where: { matricule: "ZZSV-002" } })), "ZZSV-002 supprimé par la restauration")
    verifier(!!(await db.user.findUnique({ where: { email: ADMIN_EMAIL } })), "comptes restaurés")
    verifier((await db.menu.count({ where: { etablissementId: S.id } })) === 1 && !!(await db.plat.findFirst({ where: { name: "ZZ Plat Sv" } })), "menus et plats restaurés")
    const empRest = await db.employeRh.findFirst({ where: { matricule: "ZZSV-E1" }, include: { bulletins: { orderBy: { periode: "asc" } } } })
    verifier(!!empRest && empRest.salaireBase === 200000 && empRest.dateEmbauche.toISOString().slice(0, 10) === "2024-02-01", "employé de paie restauré")
    const parRest = await db.parametresPaie.findUnique({ where: { etablissementId: S.id } })
    verifier(!!parRest && parRest.atBp === 300 && parRest.cnpsDeductibleIts === true, "paramètres de paie restaurés")
    verifier(empRest.bulletins.length === 2 && empRest.bulletins[0].statut === "VALIDATED" && empRest.bulletins[0].valideLe !== null && empRest.bulletins[0].net === 164900 && empRest.bulletins[1].statut === "DRAFT" && empRest.bulletins[1].valideLe === null, "bulletins de paie restaurés (validé et brouillon)")
    const resSv = await db.reservation.findMany({ where: { etablissementId: S.id } })
    verifier(resSv.length === 1 && resSv[0].servedAt !== null && resSv[0].statut === "BOOKED", "réservations restaurées")
    for (const action of ["TWO_FACTOR_ENABLED", "TWO_FACTOR_RESET", "BACKUP_RESTORED"]) {
      verifier(!!(await db.auditLog.findFirst({ where: { action } })), "audit " + action + " attendu")
    }
  })

  await admin.context().close()
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
console.log(code === 0 ? "=== TESTS SECURITE OK ===" : "=== TESTS SECURITE ECHEC ===")
process.exit(code)