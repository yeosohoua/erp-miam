import "dotenv/config"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../src/generated/prisma/client.ts"
import { allerRetour } from "../src/lib/sauvegarde-sql.ts"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

async function nettoyer() {
  await db.etablissement.deleteMany({ where: { code: { startsWith: "ZZ" } } })
}

async function principal() {
  await nettoyer()
  const E = await db.etablissement.create({ data: { code: "ZZ-CY", name: "ZZ Cycle", type: "SCHOOL" } })
  const logo = await db.image.create({ data: { etablissementId: E.id, mime: "image/png", taille: 3, donnees: Buffer.from([1, 2, 3]) } })
  await db.etablissement.update({ where: { id: E.id }, data: { logoId: logo.id } })
  const photo = await db.image.create({ data: { etablissementId: E.id, mime: "image/png", taille: 3, donnees: Buffer.from([4, 5, 6]) } })
  await db.inscrit.create({ data: { etablissementId: E.id, matricule: "ZZ-CY-1", badge: "ZZ-CY-BADGE", firstName: "Zz", lastName: "Cycle", imageId: photo.id } })
  const r = await allerRetour(db)
  console.log("  tables : " + r.tables + ", lignes : " + r.lignes + ", differences : " + r.differences.length)
  if (r.differences.length > 0) {
    console.log("  " + r.differences.join(" | "))
    throw new Error("l'aller-retour modifie les donnees")
  }
  const e = await db.etablissement.findUnique({ where: { id: E.id } })
  if (e.logoId !== logo.id) throw new Error("le logo n'est plus rattache apres l'aller-retour")
  console.log("  OK     aller-retour avec cycle (logo d'etablissement) : donnees identiques")
}

principal()
  .then(async () => {
    await nettoyer()
    await db.$disconnect()
    console.log("=== TESTS SAUVEGARDE CYCLE OK ===")
    process.exit(0)
  })
  .catch(async (e) => {
    console.log("ERREUR : " + e.message)
    await nettoyer().catch(() => {})
    await db.$disconnect().catch(() => {})
    console.log("=== TESTS SAUVEGARDE CYCLE ECHEC ===")
    process.exit(1)
  })