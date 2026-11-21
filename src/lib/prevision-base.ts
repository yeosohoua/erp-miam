// Prevision de frequentation, quantites a produire et a commander : fonctions pures, sans acces base de donnees.
export type TypeEvenement = "VACANCES" | "FERIE" | "METEO" | "EVENEMENT"
export const TYPES_EVENEMENT: Record<TypeEvenement, string> = { VACANCES: "Vacances", FERIE: "Jour férié", METEO: "Météo", EVENEMENT: "Événement" }
export const ORDRE_TYPES_EVENEMENT: TypeEvenement[] = ["VACANCES", "FERIE", "METEO", "EVENEMENT"]
export type TypeGaspillage = "RESTE_ASSIETTE" | "INVENDU" | "PREPARE_EN_TROP"
export const TYPES_GASPILLAGE: Record<TypeGaspillage, string> = { RESTE_ASSIETTE: "Restes d'assiette", INVENDU: "Invendu", PREPARE_EN_TROP: "Préparé en trop" }
export const ORDRE_TYPES_GASPILLAGE: TypeGaspillage[] = ["RESTE_ASSIETTE", "INVENDU", "PREPARE_EN_TROP"]

export const MARGE_DEFAUT = 5
const NB_MEME_JOUR = 8
const DECROISSANCE = 0.8
const SEUIL_FERMETURE = -50

export type JourHistorique = { date: string; servis: number; reserves: number }
export type Evenement = { type: TypeEvenement; debut: string; fin: string; impactPct: number; libelle: string }
export type Facteur = { libelle: string; pct: number }
export type Confiance = "FAIBLE" | "MOYENNE" | "BONNE"
export type Prevision = {
  prevu: number | null
  base: number | null
  bas: number
  haut: number
  tauxPresence: number | null
  facteurs: Facteur[]
  confiance: Confiance
  observations: number
  reserves: number
}

export const q3 = (n: number): number => Math.round((n + Number.EPSILON) * 1000) / 1000
const jourSemaine = (iso: string): number => new Date(iso + "T00:00:00.000Z").getUTCDay()
const joursEntre = (a: string, b: string): number => Math.round((Date.parse(b + "T00:00:00.000Z") - Date.parse(a + "T00:00:00.000Z")) / 86_400_000)
const couvre = (e: Evenement, iso: string): boolean => iso >= e.debut && iso <= e.fin

// Prevoit le nombre de repas d'un service a une date.
// Historique : moyenne ponderee (poids decroissant) des memes jours de la semaine, hors jours de fermeture.
// Reservations : appliquees avec le taux de presence observe, d'autant plus pesantes que la date est proche.
// Calendrier : les evenements multiplient le resultat.
export function prevoir(o: { cible: string; aujourdhui: string; historique: JourHistorique[]; reserves: number; evenements: Evenement[] }): Prevision {
  const sem = jourSemaine(o.cible)
  const retenus = o.historique
    .filter((h) => h.date < o.cible && jourSemaine(h.date) === sem && (h.servis > 0 || h.reserves > 0))
    .filter((h) => !o.evenements.some((e) => couvre(e, h.date) && e.impactPct <= SEUIL_FERMETURE))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, NB_MEME_JOUR)

  let poids = 0
  let somme = 0
  let poidsRes = 0
  let reservesPond = 0
  let servisPond = 0
  retenus.forEach((h, i) => {
    const w = DECROISSANCE ** i
    poids += w
    somme += w * h.servis
    if (h.reserves > 0) {
      poidsRes += w
      reservesPond += w * h.reserves
      servisPond += w * h.servis
    }
  })
  const base = poids > 0 ? somme / poids : null
  const taux = poidsRes > 0 && reservesPond > 0 ? servisPond / reservesPond : null

  const delai = joursEntre(o.aujourdhui, o.cible)
  const alpha = delai <= 1 ? 0.8 : delai <= 3 ? 0.6 : delai <= 7 ? 0.4 : 0.2
  const estimation = o.reserves > 0 ? o.reserves * (taux ?? 0.9) : null
  const brut = estimation !== null && base !== null ? alpha * estimation + (1 - alpha) * base : (estimation ?? base)

  const facteurs: Facteur[] = o.evenements.filter((e) => couvre(e, o.cible)).map((e) => ({ libelle: e.libelle, pct: e.impactPct }))
  const coef = facteurs.reduce((c, f) => c * Math.max(0, 1 + f.pct / 100), 1)
  const prevu = brut === null ? null : Math.round(brut * coef)

  const valeurs = retenus.map((h) => h.servis)
  const n = valeurs.length
  const moyenne = n > 0 ? valeurs.reduce((t, v) => t + v, 0) / n : 0
  const ecartType = n >= 2 ? Math.sqrt(valeurs.reduce((t, v) => t + (v - moyenne) ** 2, 0) / (n - 1)) : 0
  const bande = prevu === null ? 0 : n >= 3 ? Math.max(Math.round(1.28 * ecartType * coef), Math.round(prevu * 0.05)) : Math.round(prevu * 0.2)
  const confiance: Confiance = n >= 6 && moyenne > 0 && ecartType / moyenne < 0.15 ? "BONNE" : n >= 3 ? "MOYENNE" : "FAIBLE"

  return {
    prevu,
    base: base === null ? null : Math.round(base),
    bas: prevu === null ? 0 : Math.max(0, prevu - bande),
    haut: prevu === null ? 0 : prevu + bande,
    tauxPresence: taux,
    facteurs,
    confiance,
    observations: n,
    reserves: o.reserves,
  }
}

export const aProduireRecommande = (prevu: number, margePct: number): number => Math.ceil(prevu * (1 + margePct / 100))
export const ecartPct = (prevu: number, reel: number): number | null => (reel > 0 ? Math.round((Math.abs(prevu - reel) * 100) / reel) : null)

export type PlatRecette = { portions: number; lignes: { ingredientId: string; quantite: number }[] }

// Besoin en ingredients pour un nombre de repas : meme calcul que la consommation du stock (chaque convive prend une portion de chaque plat).
export function besoinsIngredients(plats: PlatRecette[], repas: number): Map<string, number> {
  const besoins = new Map<string, number>()
  for (const p of plats) {
    const portions = p.portions > 0 ? p.portions : 1
    for (const l of p.lignes) besoins.set(l.ingredientId, (besoins.get(l.ingredientId) ?? 0) + (l.quantite * repas) / portions)
  }
  return besoins
}

export type LigneCommande = { ingredientId: string; besoin: number; stock: number; enCommande: number; securite: number; manque: number }

// A commander = besoin + stock de securite - stock disponible - commandes deja en cours.
export function aCommander(p: { besoins: Map<string, number>; stock: Map<string, number>; seuil: Map<string, number>; enCommande: Map<string, number> }): LigneCommande[] {
  const lignes: LigneCommande[] = []
  for (const [ingredientId, besoin] of p.besoins) {
    const stock = p.stock.get(ingredientId) ?? 0
    const enCommande = p.enCommande.get(ingredientId) ?? 0
    const securite = p.seuil.get(ingredientId) ?? 0
    lignes.push({ ingredientId, besoin: q3(besoin), stock: q3(stock), enCommande: q3(enCommande), securite: q3(securite), manque: q3(Math.max(0, besoin + securite - stock - enCommande)) })
  }
  return lignes
}