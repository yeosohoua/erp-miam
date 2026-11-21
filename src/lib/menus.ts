export const SERVICES = { BREAKFAST: "Petit-déjeuner", LUNCH: "Déjeuner", SNACK: "Goûter", DINNER: "Dîner" } as const
export type ServiceMenu = keyof typeof SERVICES
export const ORDRE_SERVICES: readonly ServiceMenu[] = ["BREAKFAST", "LUNCH", "SNACK", "DINNER"]
export const serviceValide = (v: string): v is ServiceMenu => Object.hasOwn(SERVICES, v)

export const UNITES = ["g", "kg", "ml", "l", "pièce"] as const
export const uniteValide = (v: string): boolean => (UNITES as readonly string[]).includes(v)

// Nombre positif ou nul, virgule ou point, 4 decimales maximum.
export function parseNombre(v: string): number | null {
  const s = v.trim().replace(",", ".")
  if (!/^\d{1,9}(\.\d{1,4})?$/.test(s)) return null
  return Number(s)
}
export const arrondi = (n: number, d = 2): number => {
  const f = 10 ** d
  return Math.round((n + Number.EPSILON) * f) / f
}
export const formaterMontant = (n: number, devise: string): string => new Intl.NumberFormat("fr-FR", { style: "currency", currency: devise, maximumFractionDigits: 2 }).format(n)
export const formaterNombre = (n: number): string => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(n)

// Dates calendaires (AAAA-MM-JJ) manipulees en UTC : aucun decalage de fuseau.
export function dateValide(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(v + "T00:00:00.000Z")
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}
export const versDate = (v: string): Date => new Date(v + "T00:00:00.000Z")
export const versIso = (d: Date): string => d.toISOString().slice(0, 10)
export const ajouterJours = (iso: string, n: number): string => versIso(new Date(versDate(iso).getTime() + n * 86_400_000))
export const lundiDe = (iso: string): string => ajouterJours(iso, -((versDate(iso).getUTCDay() + 6) % 7))
export const aujourdhui = (): string => new Date().toISOString().slice(0, 10)
export const joursDeLaSemaine = (lundi: string): string[] => Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i))
export const libelleJour = (iso: string): string => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(versDate(iso))
export const libelleCourt = (iso: string): string => new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(versDate(iso))

export type PlatAnalysable = {
  portions: number
  ingredients: { quantity: unknown; ingredient: { unitCost: unknown; allergens: { allergie: { id: string; name: string } }[] } }[]
}

// Cout total, cout par portion et allergenes d'un plat (deduits de ses ingredients).
export function analysePlat(p: PlatAnalysable): { cout: number; coutPortion: number; allergenes: { id: string; name: string }[] } {
  let total = 0
  const allergenes = new Map<string, string>()
  for (const l of p.ingredients) {
    total += Number(l.quantity) * Number(l.ingredient.unitCost)
    for (const a of l.ingredient.allergens) allergenes.set(a.allergie.id, a.allergie.name)
  }
  return {
    cout: total,
    coutPortion: p.portions > 0 ? total / p.portions : 0,
    allergenes: [...allergenes].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "fr")),
  }
}