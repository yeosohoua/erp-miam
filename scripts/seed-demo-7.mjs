import "dotenv/config"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../src/generated/prisma/client.ts"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const dateDb = (s) => new Date(s + "T00:00:00.000Z")
const jourIso = (d) => d.toISOString().slice(0, 10)
const auj = jourIso(new Date())
const plus = (iso, n) => jourIso(new Date(dateDb(iso).getTime() + n * 864e5))
const dimanche = (iso) => dateDb(iso).getUTCDay() === 0
let graine = 20261122
const alea = () => {
  graine = (graine * 1103515245 + 12345) % 2147483648
  return graine / 2147483648
}

const EQUIPEMENTS = [
  { nom: "Réfrigérateur cuisine", type: "REFRIGERATEUR", min: 0, max: 4 },
  { nom: "Congélateur viandes", type: "CONGELATEUR", min: -25, max: -18 },
  { nom: "Chambre froide légumes", type: "CHAMBRE_FROIDE", min: 0, max: 4 },
  { nom: "Bain-marie du service", type: "BAIN_MARIE", min: 63, max: 90 },
]
const TACHES = [
  { nom: "Nettoyage des plans de travail", frequence: "QUOTIDIENNE", zone: "Cuisine" },
  { nom: "Désinfection des sols de la cuisine", frequence: "QUOTIDIENNE", zone: "Cuisine" },
  { nom: "Nettoyage du réfectoire", frequence: "QUOTIDIENNE", zone: "Réfectoire" },
  { nom: "Vidage et lavage des poubelles", frequence: "QUOTIDIENNE", zone: "Extérieur" },
  { nom: "Dégivrage du congélateur", frequence: "HEBDOMADAIRE", zone: "Stockage" },
  { nom: "Nettoyage des hottes et filtres", frequence: "HEBDOMADAIRE", zone: "Cuisine" },
]
const MANUELLES = [
  { titre: "Étiquetage manquant sur des bacs de sauce", gravite: "MINEURE", statut: "CLOTUREE", action: "Étiquettes remises et personnel rappelé aux consignes", jours: -9 },
  { titre: "Présence d'insectes près de la plonge", gravite: "MAJEURE", statut: "CORRIGEE", action: "Traitement par une entreprise agréée, contrôle prévu", jours: -5 },
  { titre: "Gants à usage unique non utilisés au service", gravite: "MINEURE", statut: "OUVERTE", action: null, jours: -1 },
]

async function remplir(etab) {
  if ((await db.equipement.count({ where: { etablissementId: etab.id } })) > 0) return { etab: etab.code, ignore: "déjà rempli" }
  const eqs = []
  for (const e of EQUIPEMENTS) eqs.push(await db.equipement.create({ data: { etablissementId: etab.id, nom: e.nom, type: e.type, tempMin: e.min, tempMax: e.max } }))
  let releves = 0
  let ncAuto = 0
  for (let j = -13; j <= 0; j++) {
    const d = plus(auj, j)
    if (dimanche(d)) continue
    for (let i = 0; i < EQUIPEMENTS.length; i++) {
      const e = EQUIPEMENTS[i]
      for (const h of [7.5, 14]) {
        const milieu = (e.min + e.max) / 2
        const demi = (e.max - e.min) / 2
        let valeur = Math.round((milieu + (alea() - 0.5) * demi * 1.4) * 10) / 10
        if (alea() < 0.04) valeur = e.type === "BAIN_MARIE" ? Math.round((e.min - 1 - alea() * 4) * 10) / 10 : Math.round((e.max + 1 + alea() * 4) * 10) / 10
        const conforme = valeur >= e.min && valeur <= e.max
        const mesureLe = new Date(dateDb(d).getTime() + h * 3600e3)
        await db.releveTemperature.create({ data: { etablissementId: etab.id, equipementId: eqs[i].id, valeur, conforme, mesureLe, par: "demo@miam.test", action: conforme ? null : "Porte refermée et température recontrôlée" } })
        releves += 1
        if (!conforme) {
          const ecart = valeur < e.min ? e.min - valeur : valeur - e.max
          const statut = j < -8 ? "CLOTUREE" : j < -3 ? "CORRIGEE" : "OUVERTE"
          await db.nonConformite.create({
            data: {
              etablissementId: etab.id,
              titre: "Température hors plage : " + e.nom,
              detail: valeur + " °C relevés (plage " + e.min + " à " + e.max + " °C)",
              gravite: ecart <= 2 ? "MINEURE" : ecart <= 5 ? "MAJEURE" : "CRITIQUE",
              statut,
              source: "TEMPERATURE",
              actionCorrective: "Porte refermée et température recontrôlée",
              creePar: "demo@miam.test",
              createdAt: mesureLe,
              closLe: statut === "CLOTUREE" ? mesureLe : null,
            },
          })
          ncAuto += 1
        }
      }
    }
  }
  for (const m of MANUELLES) {
    await db.nonConformite.create({ data: { etablissementId: etab.id, titre: m.titre, gravite: m.gravite, statut: m.statut, source: "MANUELLE", actionCorrective: m.action, creePar: "demo@miam.test", createdAt: new Date(dateDb(plus(auj, m.jours)).getTime() + 10 * 3600e3), closLe: m.statut === "CLOTUREE" ? new Date() : null } })
  }
  const taches = []
  for (const t of TACHES) taches.push(await db.tacheHygiene.create({ data: { etablissementId: etab.id, nom: t.nom, frequence: t.frequence, zone: t.zone } }))
  let executions = 0
  for (let j = -13; j <= 0; j++) {
    const d = plus(auj, j)
    if (dimanche(d)) continue
    for (let i = 0; i < TACHES.length; i++) {
      const quotidienne = TACHES[i].frequence === "QUOTIDIENNE"
      const lundi = dateDb(d).getUTCDay() === 2
      if (quotidienne ? alea() < 0.92 : lundi) {
        await db.executionHygiene.create({ data: { etablissementId: etab.id, tacheId: taches[i].id, date: dateDb(d), faitPar: "demo@miam.test" } })
        executions += 1
      }
    }
  }
  const plats = await db.plat.findMany({ where: { etablissementId: etab.id, active: true }, select: { name: true }, orderBy: { name: "asc" }, take: 12 })
  let temoins = 0
  for (let j = -9; j <= 0 && plats.length > 0; j++) {
    const d = plus(auj, j)
    if (dimanche(d)) continue
    const fin = plus(d, 5)
    await db.echantillonTemoin.create({ data: { etablissementId: etab.id, date: dateDb(d), service: "LUNCH", platNom: plats[(j + 9) % plats.length].name, conserveJusqu: dateDb(fin), emplacement: "Réfrigérateur cuisine, bac témoins", preparePar: "demo@miam.test", jete: fin < auj } })
    temoins += 1
  }
  return { etab: etab.code, equipements: eqs.length, releves, ncAuto, ncManuelles: MANUELLES.length, taches: taches.length, executions, temoins }
}

const etabs = await db.etablissement.findMany({ where: { code: { in: ["GSL-COCODY", "CE-PLATEAU"] } } })
if (etabs.length === 0) console.log("Aucun établissement de démonstration : rien à faire.")
for (const etab of etabs) console.log(JSON.stringify(await remplir(etab)))
await db.$disconnect()
console.log("=== SEED DEMO 7 OK ===")