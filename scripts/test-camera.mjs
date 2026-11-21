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

const PORT = 3140
const BASE = "http://localhost:" + PORT
const mdp = secret()
const CAIS = "test-cam-cais@miam.test"

async function nettoyer() {
  await db.auditLog.deleteMany({ where: { userEmail: CAIS } })
  await db.user.deleteMany({ where: { email: CAIS } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
  await redis.del("rl:fail:" + CAIS, "rl:blk:" + CAIS)
}

async function ouvrirCaisse(ctx) {
  const p = await ctx.newPage()
  p.setDefaultTimeout(30000)
  await p.goto(BASE + "/login", { waitUntil: "load" })
  await p.waitForLoadState("networkidle").catch(() => {})
  await p.locator('input[name="email"]').fill(CAIS)
  await p.locator('input[name="password"]').fill(mdp)
  await p.locator('button[type="submit"]').first().click()
  await p.waitForURL((u) => u.pathname === "/", { timeout: 30000 })
  await p.goto(BASE + "/caisse", { waitUntil: "load" })
  await p.waitForLoadState("networkidle").catch(() => {})
  await p.locator('[data-testid="caisse-page"]:visible').waitFor()
  return p
}

async function principal() {
  console.log("Preparation...")
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-CAM", name: "ZZ Cantine Camera", type: "SCHOOL", prepaye: true } })
  await db.user.create({ data: { email: CAIS, name: "Test Cam Cais", role: "CASHIER", passwordHash: bcrypt.hashSync(mdp, 10), active: true, etablissements: { create: [{ etablissementId: E.id }] } } })
  await db.articleCarte.create({ data: { etablissementId: E.id, nom: "ZZ Jus", prix: 500, categorie: "Boissons" } })

  serveur = spawn("npx", ["next", "start", "-p", String(PORT)], { shell: true, cwd: process.cwd(), env: process.env, stdio: "ignore" })
  await attendre(async () => {
    try {
      return (await fetch(BASE + "/api/sante")).ok
    } catch {
      return false
    }
  }, "demarrage du serveur", 60000)
  navigateur = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] })

  const ctx = await navigateur.newContext({ locale: "fr-FR", viewport: { width: 1440, height: 2400 }, permissions: ["camera"] })
  await ctx.addInitScript(() => {
    window.__flux = []
    const md = navigator.mediaDevices
    if (md && md.getUserMedia) {
      const orig = md.getUserMedia.bind(md)
      md.getUserMedia = async (c) => {
        const s = await orig(c)
        window.__flux.push(s)
        return s
      }
    }
    // Detecteur simule : renvoie le code place dans window.__qr (la camera de test n'affiche pas de vrai QR).
    window.BarcodeDetector = class {
      async detect() {
        return window.__qr ? [{ rawValue: window.__qr }] : []
      }
    }
  })
  const p = await ouvrirCaisse(ctx)
  const bouton = p.locator('[data-testid="camera-bascule"]:visible').first()
  const videos = () => p.locator('[data-testid="camera-video"]').count()

  await etape("Caisse : la caméra s'ouvre (flux vidéo actif) puis s'arrête et libère le flux", async () => {
    await bouton.waitFor()
    await bouton.click()
    await p.locator('[data-testid="camera-video"]').waitFor()
    await attendre(
      () => p.evaluate(() => { const v = document.querySelector("video"); return !!v && v.readyState >= 2 && window.__flux.some((s) => s.getTracks().some((t) => t.readyState === "live")) }),
      "flux vidéo actif",
    )
    verifier((await bouton.innerText()).includes("Arrêter"), "le bouton propose d'arrêter")
    await bouton.click()
    await attendre(async () => (await videos()) === 0, "aperçu fermé")
    await attendre(() => p.evaluate(() => window.__flux.every((s) => s.getTracks().every((t) => t.readyState === "ended"))), "flux libéré")
  })

  await etape("Caisse : un code lu remplit le champ, ferme la caméra", async () => {
    await bouton.click()
    await p.locator('[data-testid="camera-video"]').waitFor()
    await p.evaluate(() => { window.__qr = "ZZ-BADGE-1" })
    await attendre(async () => (await p.locator("#ca-identifiant").inputValue()) === "ZZ-BADGE-1", "champ rempli par le scan")
    await attendre(async () => (await videos()) === 0, "caméra fermée après lecture")
  })

  await etape("Caméra refusée : message clair, pas de plantage", async () => {
    const ctx2 = await navigateur.newContext({ locale: "fr-FR", viewport: { width: 1440, height: 2400 } })
    await ctx2.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException("refus", "NotAllowedError")
      }
    })
    const p2 = await ouvrirCaisse(ctx2)
    await p2.locator('[data-testid="camera-bascule"]:visible').first().click()
    const msg = await p2.locator('[data-testid="camera-erreur"]').innerText()
    verifier(/refus/i.test(msg), "message de refus (obtenu : " + msg + ")")
    verifier((await p2.locator('[data-testid="camera-video"]').count()) === 0, "pas d'aperçu après refus")
  })
}

principal()
  .then(() => terminer(nettoyer, "CAMERA", 0))
  .catch((e) => {
    console.log("ERREUR : " + e.message)
    return terminer(nettoyer, "CAMERA", 1)
  })