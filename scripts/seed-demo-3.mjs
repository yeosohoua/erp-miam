import "dotenv/config"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../src/generated/prisma/client.ts"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const T0 = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())
const jour = (off) => new Date(T0 + off * 864e5)

async function principal() {
  const E = await db.etablissement.findUnique({ where: { code: "GSL-COCODY" } })
  if (!E) { console.log("Lancez d'abord : npx tsx scripts\\seed-demo.mjs"); return }
  if ((await db.aide.count({ where: { etablissementId: E.id } })) > 0) { console.log("Les aides de demonstration sont deja presentes."); return }
  const aide = async (nom, type, valeur, description) => db.aide.create({ data: { etablissementId: E.id, nom, type, valeur, description } })
  const bourse = await aide("Bourse d'excellence", "POURCENTAGE", 50, "Meilleurs élèves de la classe, sur décision du conseil de direction")
  const social = await aide("Tarif social", "MONTANT", 300, "Familles en situation de précarité, sur dossier social")
  const gratuit = await aide("Gratuité pupille de la Nation", "GRATUIT", 0, "Orphelins pris en charge par la direction")
  const fratrie = await aide("Réduction fratrie", "POURCENTAGE", 20, "Deux enfants ou plus inscrits dans l'établissement")
  const par = async (rang) => db.inscrit.findFirst({ where: { etablissementId: E.id, matricule: `26GSL${String(rang).padStart(4, "0")}`, statut: "ACTIVE" }, select: { id: true } })
  const lignes = [
    [5, bourse, 0, null, "Major de classe, premier trimestre"],
    [14, bourse, 0, null, "Moyenne générale supérieure à 17"],
    [9, social, 0, null, "Dossier social validé par l'assistante sociale"],
    [21, social, 0, jour(120), "Aide de l'année scolaire en cours"],
    [33, social, 0, null, "Famille nombreuse, dossier social"],
    [27, gratuit, 0, null, "Pupille de la Nation, décision de la direction"],
    [38, fratrie, 0, null, "Frère en CM2"],
    [44, fratrie, 10, null, "Sœur inscrite en 6ème, effective dans dix jours"],
    [50, bourse, -90, jour(-50), "Bourse du trimestre précédent, terminée"],
  ]
  let n = 0
  for (const [rang, a, off, fin, motif] of lignes) {
    const i = await par(rang)
    if (!i) continue
    await db.aideInscrit.create({ data: { etablissementId: E.id, inscritId: i.id, aideId: a.id, debut: jour(off), fin, motif, createdBy: "marie-laure.aka@miam-demo.ci" } })
    n++
  }
  console.log(`Aides de demonstration : 4 aides, ${n} attributions`)
}

principal()
  .catch((e) => { console.error("Echec : " + (e && e.message ? e.message : e)); process.exitCode = 1 })
  .finally(() => db.$disconnect())