// Calculs purs des aides sociales (aucun import applicatif : testable avec tsx).
export const TYPES_AIDE = { POURCENTAGE: "Pourcentage du prix", MONTANT: "Montant fixe par repas", GRATUIT: "Gratuité totale" } as const
export type TypeAideCle = keyof typeof TYPES_AIDE
export const ORDRE_TYPES_AIDE: TypeAideCle[] = ["POURCENTAGE", "MONTANT", "GRATUIT"]
export const VALEUR_AIDE_MAX = 1_000_000

export type AideCalcul = { id?: string; nom: string; type: TypeAideCle; valeur: number }

export function typeAideValide(v: unknown): v is TypeAideCle {
  return typeof v === "string" && Object.hasOwn(TYPES_AIDE, v)
}

export function valeurAideValide(type: TypeAideCle, valeur: number): boolean {
  if (!Number.isInteger(valeur)) return false
  if (type === "GRATUIT") return valeur === 0
  if (type === "POURCENTAGE") return valeur >= 1 && valeur <= 100
  return valeur >= 1 && valeur <= VALEUR_AIDE_MAX
}

// Montant retire du prix : jamais plus que le prix, jamais negatif.
export function reduction(a: Pick<AideCalcul, "type" | "valeur">, prix: number): number {
  if (!Number.isFinite(prix) || prix <= 0) return 0
  if (a.type === "GRATUIT") return prix
  if (a.type === "POURCENTAGE") return Math.min(prix, Math.round((prix * a.valeur) / 100))
  return Math.min(prix, Math.max(0, a.valeur))
}

// Une seule aide s'applique : la plus avantageuse (a egalite, la premiere de la liste).
export function prixApresAides(prix: number, aides: AideCalcul[]): { prix: number; reduction: number; aide: AideCalcul | null } {
  let meilleure: AideCalcul | null = null
  let meilleur = 0
  for (const a of aides) {
    const r = reduction(a, prix)
    if (r > meilleur) { meilleur = r; meilleure = a }
  }
  return { prix: Math.max(0, prix - meilleur), reduction: meilleur, aide: meilleure }
}

export function aideActiveLe(debut: string, fin: string | null, date: string): boolean {
  return debut <= date && (fin === null || date <= fin)
}

export function dateIsoValide(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s + "T00:00:00.000Z")
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export function periodeValide(debut: string, fin: string | null): string | null {
  if (!dateIsoValide(debut)) return "Date de début invalide."
  if (fin !== null && !dateIsoValide(fin)) return "Date de fin invalide."
  if (fin !== null && fin < debut) return "La fin ne peut pas précéder le début."
  return null
}

const espaces = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")
export function libelleAide(a: Pick<AideCalcul, "type" | "valeur">): string {
  if (a.type === "GRATUIT") return "Gratuit"
  if (a.type === "POURCENTAGE") return `${a.valeur} %`
  return `${espaces(a.valeur)} FCFA par repas`
}

export function coutEstime(a: Pick<AideCalcul, "type" | "valeur">, prixRepas: number, repas: number): number {
  return reduction(a, prixRepas) * Math.max(0, repas)
}