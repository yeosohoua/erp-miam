export const TYPES_EQUIPEMENT = ["REFRIGERATEUR", "CONGELATEUR", "CHAMBRE_FROIDE", "BAIN_MARIE", "VITRINE"] as const
export type TypeEquipementCle = (typeof TYPES_EQUIPEMENT)[number]

export const LIBELLES_TYPE: Record<TypeEquipementCle, string> = {
  REFRIGERATEUR: "Réfrigérateur",
  CONGELATEUR: "Congélateur",
  CHAMBRE_FROIDE: "Chambre froide",
  BAIN_MARIE: "Bain-marie",
  VITRINE: "Vitrine réfrigérée",
}

export const BORNES_DEFAUT: Record<TypeEquipementCle, { min: number; max: number }> = {
  REFRIGERATEUR: { min: 0, max: 4 },
  CONGELATEUR: { min: -25, max: -18 },
  CHAMBRE_FROIDE: { min: 0, max: 4 },
  BAIN_MARIE: { min: 63, max: 90 },
  VITRINE: { min: 0, max: 8 },
}

export const GRAVITES = ["MINEURE", "MAJEURE", "CRITIQUE"] as const
export type GraviteCle = (typeof GRAVITES)[number]
export const LIBELLES_GRAVITE: Record<GraviteCle, string> = { MINEURE: "Mineure", MAJEURE: "Majeure", CRITIQUE: "Critique" }

export const STATUTS_NC = ["OUVERTE", "CORRIGEE", "CLOTUREE"] as const
export type StatutNCCle = (typeof STATUTS_NC)[number]
export const LIBELLES_STATUT_NC: Record<StatutNCCle, string> = { OUVERTE: "Ouverte", CORRIGEE: "Corrigée", CLOTUREE: "Clôturée" }

export const FREQUENCES = ["QUOTIDIENNE", "HEBDOMADAIRE"] as const
export type FrequenceCle = (typeof FREQUENCES)[number]
export const LIBELLES_FREQUENCE: Record<FrequenceCle, string> = { QUOTIDIENNE: "Quotidienne", HEBDOMADAIRE: "Hebdomadaire" }

export const DUREE_CONSERVATION_TEMOIN = 5

export function releveConforme(valeur: number, min: number, max: number): boolean {
  return valeur >= min && valeur <= max
}

export function ecartTemperature(valeur: number, min: number, max: number): number {
  const e = valeur < min ? min - valeur : valeur > max ? valeur - max : 0
  return Math.round(e * 10) / 10
}

export function graviteEcart(ecart: number): GraviteCle {
  if (ecart <= 2) return "MINEURE"
  if (ecart <= 5) return "MAJEURE"
  return "CRITIQUE"
}

export function ajouterJoursIso(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00.000Z")
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function debutSemaine(iso: string): string {
  const jour = new Date(iso + "T00:00:00.000Z").getUTCDay()
  return ajouterJoursIso(iso, -((jour + 6) % 7))
}

// Une tache quotidienne doit etre faite chaque jour, une tache hebdomadaire une fois par semaine (du lundi au dimanche).
export function tacheFaite(frequence: string, aujourdhui: string, datesExecutions: string[]): boolean {
  if (frequence === "HEBDOMADAIRE") {
    const debut = debutSemaine(aujourdhui)
    return datesExecutions.some((d) => d >= debut && d <= aujourdhui)
  }
  return datesExecutions.includes(aujourdhui)
}

export function bilanReleves(releves: { conforme: boolean }[]): { total: number; conformes: number; taux: number | null } {
  const total = releves.length
  const conformes = releves.filter((r) => r.conforme).length
  return { total, conformes, taux: total === 0 ? null : Math.round((conformes / total) * 100) }
}

export function resumerRappel(consommations: { date: string; service: string; repas: number }[]): { nbServices: number; repas: number; premier: string | null; dernier: string | null } {
  if (consommations.length === 0) return { nbServices: 0, repas: 0, premier: null, dernier: null }
  const dates = consommations.map((c) => c.date).sort()
  return { nbServices: consommations.length, repas: consommations.reduce((s, c) => s + c.repas, 0), premier: dates[0], dernier: dates[dates.length - 1] }
}