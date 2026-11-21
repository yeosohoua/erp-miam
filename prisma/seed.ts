import "dotenv/config"

import { PrismaPg } from "@prisma/adapter-pg"
import { hash } from "bcryptjs"

import { PrismaClient } from "../src/generated/prisma/client"

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase()
  const motDePasse = process.env.SEED_ADMIN_PASSWORD ?? ""
  if (!email || motDePasse.length < 10) {
    throw new Error("SEED_ADMIN_EMAIL et SEED_ADMIN_PASSWORD (10 caractères minimum) sont requis.")
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  try {
    const existant = await db.user.findUnique({ where: { email } })
    if (existant) {
      console.log("Administrateur déjà présent : " + email)
    } else {
      await db.user.create({
        data: { email, name: "Administrateur", role: "ADMIN", passwordHash: await hash(motDePasse, 12) },
      })
      console.log("Administrateur créé : " + email)
    }
    if ((await db.etablissement.count()) === 0) {
      await db.etablissement.create({ data: { code: "PRINCIPAL", name: "Établissement principal", type: "SCHOOL" } })
      console.log("Établissement principal créé.")
    }
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})