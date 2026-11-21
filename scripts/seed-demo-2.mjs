import "dotenv/config"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../src/generated/prisma/client.ts"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const d = (y, m, j) => new Date(Date.UTC(y, m - 1, j))
const maintenant = new Date()
const T0 = Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate())

async function principal() {
  const E = await db.etablissement.findUnique({ where: { code: "GSL-COCODY" } })
  const P = await db.etablissement.findUnique({ where: { code: "CE-PLATEAU" } })
  if (!E || !P) { console.log("Lancez d'abord : npx tsx scripts\\seed-demo.mjs"); return }
  if ((await db.employeRh.count({ where: { etablissementId: E.id } })) > 0) { console.log("Le jeu de donnees complementaire est deja present."); return }

  // ---- tarifs ----
  await db.tarif.createMany({ data: [{ etablissementId: E.id, service: "LUNCH", prix: 600 }, { etablissementId: E.id, service: "SNACK", prix: 200 }, { etablissementId: P.id, service: "LUNCH", prix: 1500 }], skipDuplicates: true })

  // ---- allergies ----
  const refs = await db.referentiel.findMany({ where: { etablissementId: E.id, kind: "ALLERGIE" } })
  const allergie = Object.fromEntries(refs.map((r) => [r.name, r.id]))
  const parRang = [[3, ["Arachide"]], [8, ["Poisson"]], [12, ["Œuf"]], [19, ["Gluten"]], [23, ["Lait"]], [31, ["Arachide", "Poisson"]], [40, ["Poisson"]], [47, ["Arachide"]], [52, ["Gluten"]], [58, ["Lait"]]]
  const matricules = parRang.map(([r]) => `26GSL${String(r).padStart(4, "0")}`)
  const eleves = await db.inscrit.findMany({ where: { etablissementId: E.id, matricule: { in: matricules } }, select: { id: true, matricule: true } })
  const lignes = []
  for (const [r, noms] of parRang) {
    const e = eleves.find((x) => x.matricule === `26GSL${String(r).padStart(4, "0")}`)
    if (e) for (const n of noms) lignes.push({ inscritId: e.id, allergieId: allergie[n] })
  }
  await db.inscritAllergie.createMany({ data: lignes, skipDuplicates: true })
  const ings = await db.ingredient.findMany({ where: { etablissementId: E.id }, select: { id: true, name: true } })
  const ing = Object.fromEntries(ings.map((i) => [i.name, i.id]))
  const liens = [["Pâte d'arachide", "Arachide"], ["Chinchard (poisson)", "Poisson"], ["Poisson fumé", "Poisson"], ["Spaghetti", "Gluten"]]
  await db.ingredientAllergen.createMany({ data: liens.map(([i, a]) => ({ ingredientId: ing[i], allergieId: allergie[a] })), skipDuplicates: true })

  // ---- RH ----
  const rh = [
    ["RH-001", "Marie-Laure", "Aka", "Directrice", d(2019, 9, 2), 650000, 100000, 25000, "MARIE", 3],
    ["RH-002", "Moussa", "Diabaté", "Chef de cuisine", d(2021, 1, 11), 280000, 20000, 25000, "MARIE", 2],
    ["RH-003", "Awa", "Bakayoko", "Cuisinière", d(2022, 3, 7), 120000, 5000, 25000, "DIVORCE", 2],
    ["RH-004", "Mariam", "Konaté", "Cuisinière", d(2022, 9, 5), 118000, 5000, 25000, "CELIBATAIRE", 1],
    ["RH-005", "Fanta", "Doumbia", "Aide-cuisinière", d(2023, 10, 2), 90000, 0, 20000, "MARIE", 4],
    ["RH-006", "Yacouba", "Soro", "Agent d'hygiène", d(2024, 1, 15), 80000, 0, 15000, "CELIBATAIRE", 0],
    ["RH-007", "Ibrahim", "Coulibaly", "Caissier", d(2021, 9, 6), 140000, 10000, 25000, "MARIE", 2],
    ["RH-008", "Kouamé", "Brou", "Magasinier", d(2020, 2, 3), 160000, 10000, 25000, "MARIE", 3],
    ["RH-009", "Aminata", "Fofana", "Responsable des achats", d(2020, 6, 1), 250000, 15000, 25000, "MARIE", 1],
    ["RH-010", "Adjoua", "Tano", "Responsable RH", d(2019, 10, 14), 300000, 20000, 25000, "VEUF", 2],
    ["RH-011", "Serge", "N'Dri", "Comptable", d(2021, 3, 1), 320000, 20000, 25000, "MARIE", 2],
    ["RH-012", "Ange", "Yao", "Serveur", d(2024, 9, 2), 85000, 0, 15000, "CELIBATAIRE", 0],
    ["RH-013", "Esther", "Gnagne", "Serveuse", d(2024, 9, 2), 85000, 0, 15000, "CELIBATAIRE", 0],
    ["RH-014", "Lassina", "Ouattara", "Agent de sécurité", d(2022, 11, 21), 95000, 0, 15000, "MARIE", 3],
  ]
  await db.employeRh.createMany({
    data: rh.map(([matricule, firstName, lastName, poste, dateEmbauche, salaireBase, primes, indemniteExoneree, situation, enfants], i) => ({
      etablissementId: E.id, matricule, firstName, lastName, poste, dateEmbauche, salaireBase, primes, indemniteExoneree, situation, enfants, personnesCmu: 1, telephone: "+2250000002" + String(100 + i),
    })),
  })
  await db.parametresPaie.upsert({ where: { etablissementId: E.id }, create: { etablissementId: E.id }, update: {} })

  // ---- calendrier ----
  let pluie = -9
  while ([0, 6].includes(new Date(T0 + pluie * 864e5).getUTCDay())) pluie--
  await db.evenementCantine.createMany({
    data: [
      { etablissementId: E.id, type: "FERIE", debut: d(2026, 12, 25), fin: d(2026, 12, 25), impactPct: 0, libelle: "Noël", createdBy: "Direction" },
      { etablissementId: E.id, type: "FERIE", debut: d(2027, 1, 1), fin: d(2027, 1, 1), impactPct: 0, libelle: "Jour de l'An", createdBy: "Direction" },
      { etablissementId: E.id, type: "VACANCES", debut: d(2026, 12, 19), fin: d(2027, 1, 3), impactPct: 0, libelle: "Vacances de Noël", createdBy: "Direction" },
      { etablissementId: E.id, type: "EVENEMENT", debut: d(2026, 12, 2), fin: d(2026, 12, 2), impactPct: 20, libelle: "Journée sportive inter-classes", createdBy: "Direction" },
      { etablissementId: E.id, type: "METEO", debut: new Date(T0 + pluie * 864e5), fin: new Date(T0 + pluie * 864e5), impactPct: -10, libelle: "Fortes pluies : absences nombreuses", createdBy: "Direction" },
      { etablissementId: P.id, type: "FERIE", debut: d(2026, 12, 25), fin: d(2026, 12, 25), impactPct: 0, libelle: "Noël", createdBy: "Direction" },
      { etablissementId: P.id, type: "FERIE", debut: d(2027, 1, 1), fin: d(2027, 1, 1), impactPct: 0, libelle: "Jour de l'An", createdBy: "Direction" },
    ],
  })

  // ---- facturation de l'entreprise : repas du mois dernier ----
  const y = maintenant.getUTCMonth() === 0 ? maintenant.getUTCFullYear() - 1 : maintenant.getUTCFullYear()
  const m = maintenant.getUTCMonth() === 0 ? 12 : maintenant.getUTCMonth()
  const debut = d(y, m, 1)
  const fin = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1))
  const client = await db.client.create({ data: { etablissementId: P.id, name: "Plateau Services SA", email: "comptabilite@plateau-services.example.com", phone: "+2250000000003", address: "Avenue Franchet d'Esperey, Plateau, Abidjan" } })
  await db.inscrit.updateMany({ where: { etablissementId: P.id }, data: { clientId: client.id } })
  const servis = await db.reservation.findMany({ where: { etablissementId: P.id, statut: "BOOKED", servedAt: { not: null }, date: { gte: debut, lt: fin } }, select: { id: true } })
  let facture = null
  if (servis.length > 0) {
    const prix = 1500
    const total = servis.length * prix
    const mois = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"][m - 1]
    facture = await db.facture.create({
      data: {
        etablissementId: P.id, clientId: client.id, numero: 1, periode: `${y}-${String(m).padStart(2, "0")}`, statut: "ISSUED", total,
        emisLe: new Date(T0 - 17 * 864e5), echeance: new Date(T0 + 13 * 864e5), createdBy: "Direction",
        lignes: { create: [{ libelle: `Repas du midi – ${mois} ${y}`, quantite: servis.length, prixUnitaire: prix, montant: total }] },
      },
    })
    await db.reservation.updateMany({ where: { id: { in: servis.map((s) => s.id) } }, data: { factureId: facture.id } })
    await db.reglement.create({ data: { etablissementId: P.id, factureId: facture.id, montant: Math.round(total / 2 / 500) * 500, methode: "MTN", reference: "MOMO-FAC-0001", createdBy: "Direction" } })
  }

  console.log("=== COMPLEMENT DE DEMONSTRATION CREE ===")
  console.log(`Tarifs : 3 ; allergies d'eleves : ${lignes.length} ; allergenes d'ingredients : ${liens.length}`)
  console.log(`Personnel RH : ${rh.length} ; evenements du calendrier : 7`)
  console.log(facture ? `Facture n°1 de l'entreprise : ${servis.length} repas, ${facture.total} FCFA, reglee a moitie` : "Aucun repas le mois dernier : pas de facture")
}

principal()
  .catch((e) => { console.error("Echec : " + (e && e.message ? e.message : e)); process.exitCode = 1 })
  .finally(() => db.$disconnect())