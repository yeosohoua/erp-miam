import "dotenv/config"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../src/generated/prisma/client.ts"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const dateDb = (s) => new Date(s + "T00:00:00.000Z")
const jourIso = (d) => d.toISOString().slice(0, 10)
const auj = jourIso(new Date())
const plus = (iso, n) => jourIso(new Date(dateDb(iso).getTime() + n * 864e5))
let graine = 20261121
const alea = () => {
  graine = (graine * 1103515245 + 12345) % 2147483648
  return graine / 2147483648
}
const choisir = (liste) => liste[Math.floor(alea() * liste.length)]
const empreinte = (texte) => [...texte].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1000, 7) / 1000

const POSITIFS = ["Délicieux, mon fils en redemande.", "Très bien assaisonné, portion généreuse.", "Les enfants ont tout mangé.", "Un vrai goût de maison, merci à l'équipe.", "Cuisson parfaite."]
const NEUTRES = ["Correct, sans plus.", "Un peu fade, il manquait du piment.", "Bien mais la portion était petite.", "Rien à dire de particulier."]
const NEGATIFS = ["Trop salé aujourd'hui.", "Servi presque froid.", "Mon enfant n'a presque rien mangé.", "Trop de sauce, pas assez de viande."]
const AUTEURS = ["Mme Kouassi", "M. Traoré", "Mme Diallo", "M. Yao", "Mme N'Guessan", "M. Koné", "Mme Bamba", "M. Ouattara", "Mme Coulibaly", "M. Gnagne"]
const SUGGESTIONS = [
  { titre: "Plus de légumes frais au menu", detail: "Des légumes de saison au moins deux fois par semaine.", statut: "TRAITEE", reponse: "Ajouté dès le mois prochain avec nos fournisseurs locaux." },
  { titre: "Proposer une option sans porc", detail: "Pour les familles qui n'en consomment pas.", statut: "EN_COURS", reponse: "À l'étude avec le chef de cuisine." },
  { titre: "Ajouter de l'attiéké au menu du vendredi", detail: null, statut: "NOUVELLE", reponse: null },
  { titre: "Prévoir des fruits de saison au goûter", detail: "Mangue, banane, ananas, papaye selon la saison.", statut: "TRAITEE", reponse: "Mis en place deux fois par semaine." },
  { titre: "Un menu végétarien par semaine", detail: null, statut: "EN_COURS", reponse: "Test prévu le mois prochain." },
  { titre: "Meilleure signalisation des allergènes", detail: "Une affiche à l'entrée de la cantine.", statut: "NOUVELLE", reponse: null },
  { titre: "Allonger l'horaire de service", detail: "La file est longue entre midi et midi trente.", statut: "REJETEE", reponse: "Contrainte d'organisation des classes, nous élargissons plutôt le nombre de lignes." },
  { titre: "De l'eau fraîche à disposition", detail: null, statut: "TRAITEE", reponse: "Fontaines installées dans le réfectoire." },
]

async function remplir(etab) {
  if ((await db.avis.count({ where: { etablissementId: etab.id } })) > 0) return { etab: etab.code, ignore: "déjà rempli" }
  const plats = await db.plat.findMany({ where: { etablissementId: etab.id, active: true }, select: { id: true, name: true } })
  const lignes = []
  for (let k = 0; k < 120; k++) {
    const d = plus(auj, -Math.floor(alea() * 28))
    if (new Date(dateDb(d)).getUTCDay() === 0) continue
    const plat = plats.length > 0 && alea() < 0.85 ? choisir(plats) : null
    const base = plat ? 2.6 + empreinte(plat.name) * 2.2 : 3.6
    const note = Math.max(1, Math.min(5, Math.round(base + (alea() - 0.5) * 2)))
    const commentaire = alea() < 0.45 ? choisir(note >= 4 ? POSITIFS : note === 3 ? NEUTRES : NEGATIFS) : null
    const source = choisir(["PARENT", "PARENT", "ELEVE", "ELEVE", "PERSONNEL", "COMPTOIR"])
    lignes.push({ etablissementId: etab.id, date: dateDb(d), service: "LUNCH", platId: plat?.id ?? null, platNom: plat?.name ?? null, note, commentaire, source, auteur: source === "PARENT" ? choisir(AUTEURS) : null })
  }
  const r = await db.avis.createMany({ data: lignes })
  for (const [i, s] of SUGGESTIONS.entries()) {
    await db.suggestion.create({ data: { etablissementId: etab.id, titre: s.titre, detail: s.detail, statut: s.statut, reponse: s.reponse, auteur: choisir(AUTEURS), traitePar: s.statut === "NOUVELLE" ? null : "demo", createdAt: new Date(Date.now() - (i + 1) * 3 * 864e5) } })
  }
  return { etab: etab.code, avis: r.count, suggestions: SUGGESTIONS.length, plats: plats.length }
}

const etabs = await db.etablissement.findMany({ where: { code: { in: ["GSL-COCODY", "CE-PLATEAU"] } } })
if (etabs.length === 0) console.log("Aucun établissement de démonstration : rien à faire.")
for (const etab of etabs) console.log(JSON.stringify(await remplir(etab)))
await db.$disconnect()