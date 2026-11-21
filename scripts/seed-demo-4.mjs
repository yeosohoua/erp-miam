import "dotenv/config"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../src/generated/prisma/client.ts"
import { joursOuvrables, soldeConges } from "../src/lib/rh-avance-base.ts"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const dateDb = (s) => new Date(s + "T00:00:00.000Z")
const jourIso = (d) => d.toISOString().slice(0, 10)
const auj = jourIso(new Date())
const plus = (iso, n) => jourIso(new Date(dateDb(iso).getTime() + n * 864e5))
let graine = 20261120
const alea = () => {
  graine = (graine * 1103515245 + 12345) % 2147483648
  return graine / 2147483648
}
const choisir = (liste) => liste[Math.floor(alea() * liste.length)]

const ORGANISMES = { HACCP: "Bureau Veritas Côte d'Ivoire", FORMATION_HYGIENE: "Institut National d'Hygiène Publique (INHP)", VISITE_MEDICALE: "Service de santé au travail d'Abidjan", PREMIERS_SECOURS: "Croix-Rouge de Côte d'Ivoire" }
const MOTIFS_PERMISSION = ["Mariage d'un proche", "Décès dans la famille", "Naissance d'un enfant", "Démarches administratives"]

async function remplir(etab) {
  const employes = await db.employeRh.findMany({ where: { etablissementId: etab.id, actif: true }, orderBy: { matricule: "asc" } })
  if (employes.length === 0) return { etab: etab.code, ignore: "aucun employé" }
  if ((await db.conge.count({ where: { etablissementId: etab.id } })) > 0) return { etab: etab.code, ignore: "déjà rempli" }
  const compte = { conges: 0, pointages: 0, certifications: 0 }
  const occupe = new Map()
  const libre = (id, d, f) => !(occupe.get(id) ?? []).some(([a, b]) => a <= f && b >= d)
  const reserver = (id, d, f) => occupe.set(id, [...(occupe.get(id) ?? []), [d, f]])
  const ajouterConge = async (e, type, statut, debut, fin, motif) => {
    const jours = joursOuvrables(debut, fin)
    if (jours < 1 || !libre(e.id, debut, fin)) return
    reserver(e.id, debut, fin)
    await db.conge.create({ data: { etablissementId: etab.id, employeId: e.id, type, debut: dateDb(debut), fin: dateDb(fin), jours, statut, motif, decidePar: statut === "DEMANDE" ? null : "demo", decideLe: statut === "DEMANDE" ? null : new Date() } })
    compte.conges++
  }
  for (let i = 0; i < employes.length; i++) {
    const e = employes[i]
    const embauche = jourIso(e.dateEmbauche)
    const deja = []
    if (i % 3 !== 2) {
      const debut = plus(auj, -(40 + i * 7))
      const fin = plus(debut, 4)
      const solde = soldeConges(embauche, auj, deja)
      if (debut > embauche && joursOuvrables(debut, fin) * 10 <= solde.disponible) {
        await ajouterConge(e, "ANNUEL", "APPROUVE", debut, fin, "Congés annuels")
        deja.push({ type: "ANNUEL", statut: "APPROUVE", jours: joursOuvrables(debut, fin) })
      }
    }
    if (i % 4 === 1) await ajouterConge(e, "MALADIE", "APPROUVE", plus(auj, -(15 + i)), plus(auj, -(13 + i)), "Certificat médical")
    if (i % 5 === 3) await ajouterConge(e, "PERMISSION", "APPROUVE", plus(auj, -(25 + i)), plus(auj, -(24 + i)), choisir(MOTIFS_PERMISSION))
    if (i % 5 === 0) await ajouterConge(e, "ANNUEL", "DEMANDE", "2026-12-21", "2026-12-24", "Congés de fin d'année")
    if (i === 6) await ajouterConge(e, "ANNUEL", "REFUSE", plus(auj, 10), plus(auj, 15), "Période de forte activité")
  }
  for (const e of employes) {
    const embauche = jourIso(e.dateEmbauche)
    const lignes = []
    let jours = 0
    for (let k = 1; jours < 20 && k < 40; k++) {
      const d = plus(auj, -k)
      if (new Date(dateDb(d)).getUTCDay() === 0 || d < embauche) continue
      jours++
      const t = alea()
      const statut = t < 0.88 ? "PRESENT" : t < 0.96 ? "RETARD" : "ABSENT"
      lignes.push({ etablissementId: etab.id, employeId: e.id, date: dateDb(d), statut, minutesRetard: statut === "RETARD" ? 5 + Math.floor(alea() * 40) : 0, note: statut === "ABSENT" ? "Absence justifiée" : null, createdBy: "demo" })
    }
    const r = await db.pointage.createMany({ data: lignes, skipDuplicates: true })
    compte.pointages += r.count
  }
  const ajouterCert = async (e, type, delivree, expire) => {
    await db.certification.create({ data: { etablissementId: etab.id, employeId: e.id, type, delivreeLe: dateDb(delivree), expireLe: dateDb(expire), organisme: ORGANISMES[type] } })
    compte.certifications++
  }
  for (let i = 0; i < employes.length; i++) {
    const e = employes[i]
    const delivreeHygiene = plus(auj, -(120 + i * 20))
    await ajouterCert(e, "FORMATION_HYGIENE", delivreeHygiene, plus(delivreeHygiene, 730))
    const delivreeHaccp = plus(auj, -(200 + i * 15))
    await ajouterCert(e, "HACCP", delivreeHaccp, plus(delivreeHaccp, 730))
    let delivreeVm = plus(auj, -(30 + i * 25))
    if (i === 0) delivreeVm = plus(auj, -410)
    if (i === 1) delivreeVm = plus(auj, -340)
    await ajouterCert(e, "VISITE_MEDICALE", delivreeVm, plus(delivreeVm, 365))
    if (i % 5 < 2) {
      const delivreeSs = plus(auj, -(60 + i * 30))
      await ajouterCert(e, "PREMIERS_SECOURS", delivreeSs, plus(delivreeSs, 730))
    }
  }
  return { etab: etab.code, ...compte }
}

const etabs = await db.etablissement.findMany({ where: { code: { in: ["GSL-COCODY", "CE-PLATEAU"] } } })
if (etabs.length === 0) console.log("Aucun établissement de démonstration : rien à faire.")
for (const etab of etabs) console.log(JSON.stringify(await remplir(etab)))
await db.$disconnect()