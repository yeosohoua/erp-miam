import "dotenv/config"
import { randomBytes } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../src/generated/prisma/client.ts"
import { SauvegardeInvalide, allerRetour, exporterTout, listerTables, restaurerTout } from "../src/lib/sauvegarde-sql.ts"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const resultats = []
function verifier(c, m) {
  if (!c) throw new Error(m)
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
async function nettoyer() {
  await db.user.deleteMany({ where: { email: "test-sv-user@miam.test" } })
  await db.image.deleteMany({ where: { mime: "image/png", etablissementId: null, taille: 64 } })
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
}

async function principal() {
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-SV", name: "ZZ Sauvegarde", type: "SCHOOL" } })
  const octets = randomBytes(64)
  const img = await db.image.create({ data: { etablissementId: null, mime: "image/png", taille: 64, donnees: octets } })
  await db.user.create({ data: { email: "test-sv-user@miam.test", name: "Test Sv", role: "MANAGER", passwordHash: "x", active: true, imageId: img.id, etablissements: { create: [{ etablissementId: E.id }] } } })
  await db.sessionCaisse.create({ data: { etablissementId: E.id, numero: 1, caissierEmail: "test-sv-user@miam.test", fondInitial: 1234 } })

  await etape("Couverture : toutes les tables du schéma, y compris sessions de caisse, images et remboursements", async () => {
    const tables = await listerTables(db)
    for (const t of ["etablissements", "users", "sessions_caisse", "images", "ventes_remboursements", "ventes_comptoir", "transactions"]) verifier(tables.includes(t), "table couverte : " + t)
    verifier(tables.length >= 60, "au moins 60 tables couvertes (" + tables.length + ")")
    const tout = await exporterTout(db)
    verifier(tout.images.some((i) => i.id === img.id) && tout.sessions_caisse.some((s) => s.etablissementId === E.id), "les lignes de test sont exportées")
  })

  await etape("Aller-retour : export, restauration, ré-export identiques sur toute la base (annulé ensuite)", async () => {
    const r = await allerRetour(db)
    verifier(r.differences.length === 0, "différences : " + r.differences.join(" | "))
    console.log("         " + r.tables + " tables, " + r.lignes + " lignes comparées")
    verifier((await db.etablissement.count({ where: { code: "ZZ-SV" } })) === 1, "la transaction a bien été annulée")
    const apres = await db.image.findUnique({ where: { id: img.id } })
    verifier(Buffer.from(apres.donnees).equals(octets), "les octets de l'image sont intacts")
  })

  await etape("Refus sans effet : table inconnue, administrateur absent, fichier illisible", async () => {
    const avant = await db.etablissement.count()
    for (const [tables, motif] of [
      [{ users: [{ role: "ADMIN", active: true }], table_inventee: [] }, "table inconnue"],
      [{ users: [{ role: "MANAGER", active: true }] }, "administrateur"],
      [{ users: "pas un tableau" }, "illisible"],
    ]) {
      let erreur = null
      try {
        await restaurerTout(db, tables)
      } catch (e) {
        erreur = e
      }
      verifier(erreur instanceof SauvegardeInvalide && erreur.message.includes(motif), "refus : " + motif)
    }
    verifier((await db.etablissement.count()) === avant, "aucune donnée modifiée")
  })
}

principal()
  .then(async () => {
    await nettoyer()
    await db.$disconnect()
    console.log("")
    console.log("Resultat : " + resultats.filter((r) => r.ok).length + " / " + resultats.length + " etapes reussies")
    console.log("=== TESTS SAUVEGARDE COMPLETE OK ===")
    process.exit(0)
  })
  .catch(async (e) => {
    console.log("ERREUR : " + e.message)
    await nettoyer().catch(() => {})
    await db.$disconnect().catch(() => {})
    console.log("=== TESTS SAUVEGARDE COMPLETE ECHEC ===")
    process.exit(1)
  })