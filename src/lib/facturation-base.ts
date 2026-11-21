export const STATUTS_FACTURE = { DRAFT: "Brouillon", ISSUED: "Émise", PAID: "Payée", CANCELLED: "Annulée" } as const
export type StatutFacture = keyof typeof STATUTS_FACTURE

export const DELAI_MAX = 180
export const RELANCE_MAX = 3

export const periodeValide = (v: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(v) && v >= "2000-01"
export const emailValide = (v: string): boolean => v.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

// Bornes UTC du mois : debut inclus, fin exclue.
export function bornesPeriode(periode: string): { debut: Date; fin: Date } {
  const [a, m] = periode.split("-").map(Number)
  return { debut: new Date(Date.UTC(a, m - 1, 1)), fin: new Date(Date.UTC(a, m, 1)) }
}

export const libellePeriode = (periode: string): string => new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(bornesPeriode(periode).debut)
export const numeroAffiche = (n: number | null): string => (n === null ? "Brouillon" : "FAC-" + String(n).padStart(5, "0"))
export const restant = (total: number, reglements: { montant: number }[]): number => total - reglements.reduce((s, r) => s + r.montant, 0)