import "dotenv/config"
import { randomBytes } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"
import * as bcryptModule from "bcryptjs"
import Redis from "ioredis"
import { chromium } from "playwright"

import { PrismaClient } from "../src/generated/prisma/client.ts"

const bcrypt = bcryptModule.default ?? bcryptModule
const BASE = "http://127.0.0.1:3001"
const EMAIL = "test-dk-admin@miam.test"
const mdp = randomBytes(8).toString("hex") + "Zz9"
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const redis = new Redis(process.env.REDIS_URL)

let navigateur = null
let code = 0

function verifier(condition, message) {
  if (!condition) throw new Error(message)
}

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: EMAIL } })
  await db.user.deleteMany({ where: { email: EMAIL } })
  await redis.del("rl:fail:" + EMAIL, "rl:blk:" + EMAIL)
}

try {
  await nettoyer()
  await db.user.create({ data: { email: EMAIL, name: "Test Dk Admin", role: "ADMIN", passwordHash: bcrypt.hashSync(mdp, 10), active: true } })
  navigateur = await chromium.launch()
  const p = await (await navigateur.newContext({ locale: "fr-FR", viewport: { width: 1440, height: 900 } })).newPage()
  p.setDefaultTimeout(30000)

  await p.goto(BASE + "/login", { waitUntil: "load" })
  await p.locator('input[name="email"]').fill(EMAIL)
  await p.locator('input[name="password"]').fill(mdp)
  await p.locator('button[type="submit"]').first().click()
  await p.waitForURL((u) => u.pathname === "/", { timeout: 30000 })
  await p.locator('[data-testid="menu-principal"]').waitFor()
  console.log("  OK     Connexion (base de donnees, Redis, session)")

  await p.goto(BASE + "/inscrits", { waitUntil: "load" })
  await p.locator('[data-testid="liste-inscrits"]').waitFor()
  console.log("  OK     Module Inscrits (Prisma)")

  await p.goto(BASE + "/compte", { waitUntil: "load" })
  await p.getByRole("button", { name: "Activer la double authentification", exact: true }).click()
  await p.locator('[data-testid="qr-2fa"] svg').waitFor()
  await p.locator('[data-testid="secret-2fa"]').waitFor()
  console.log("  OK     2FA : chiffrement du secret et code QR")

  await p.goto(BASE + "/parametres/audit", { waitUntil: "load" })
  await p.locator('[data-testid="liste-audit"]').waitFor()
  console.log("  OK     Journal d'audit")

  const rep = await p.context().request.get(BASE + "/api/sauvegarde")
  verifier(rep.status() === 200, "export de sauvegarde : statut " + rep.status())
  const json = await rep.json()
  verifier(json.format === "erp-miam-sauvegarde" && Array.isArray(json.tables.users), "format de l'export")
  console.log("  OK     Export de sauvegarde")
} catch (e) {
  code = 1
  console.log("  ECHEC  " + (e && e.message ? e.message : e))
} finally {
  if (navigateur) await navigateur.close().catch(() => {})
  await nettoyer().catch((e) => console.log("Nettoyage incomplet : " + e.message))
  await db.$disconnect().catch(() => {})
  redis.disconnect()
}
console.log(code === 0 ? "=== CONTROLE DOCKER OK ===" : "=== CONTROLE DOCKER ECHEC ===")
process.exit(code)