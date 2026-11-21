// Analytique : calculs purs (series, classements, tranches, tendance, export CSV), sans acces base de donnees.
export const PERIODES_ANALYTICS = [7, 30, 90] as const
export type PeriodeAnalytics = (typeof PERIODES_ANALYTICS)[number]
export const periodeAnalytics = (v: unknown): PeriodeAnalytics => {
  const n = Number(v)
  return (PERIODES_ANALYTICS as readonly number[]).includes(n) ? (n as PeriodeAnalytics) : 30
}

export const VUES = {
  apercu: "Vue d'ensemble",
  frequentation: "Fréquentation",
  finances: "Finances",
  production: "Production et gaspillage",
  stock: "Stock et achats",
  caisse: "Caisse",
  inscrits: "Inscrits",
} as const
export type VueAnalytics = keyof typeof VUES
export const ORDRE_VUES: VueAnalytics[] = ["apercu", "frequentation", "finances", "production", "stock", "caisse", "inscrits"]
// Le chef de cuisine ne voit ni les chiffres financiers ni la caisse.
export const avecFinance = (role: string): boolean => role !== "CHEF"
export const vuesPour = (role: string): VueAnalytics[] => (avecFinance(role) ? ORDRE_VUES : ["apercu", "frequentation", "production", "stock"])
export const vueAnalytics = (v: unknown, role: string): VueAnalytics => {
  const liste = vuesPour(role) as string[]
  return typeof v === "string" && liste.includes(v) ? (v as VueAnalytics) : "apercu"
}

const MS = 86_400_000
export const ajouter = (iso: string, n: number): string => new Date(Date.parse(iso + "T00:00:00.000Z") + n * MS).toISOString().slice(0, 10)
export const joursDe = (fin: string, n: number): string[] => Array.from({ length: n }, (_, i) => ajouter(fin, i - (n - 1)))
export const libelleJourCourt = (iso: string): string => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso + "T00:00:00.000Z"))
export const libelleMois = (periode: string): string => new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(periode + "-01T00:00:00.000Z"))
export const moisMoins = (iso: string, k: number): string => {
  const [a, m] = iso.slice(0, 7).split("-").map(Number)
  return new Date(Date.UTC(a, m - 1 - k, 1)).toISOString().slice(0, 7)
}
export const JOURS_SEMAINE = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] as const
// 0 = lundi ... 6 = dimanche
export const jourSemaine = (iso: string): number => (new Date(iso + "T00:00:00.000Z").getUTCDay() + 6) % 7

export type PointJour = { date: string; label: string; valeur: number }
export const serieQuotidienne = (jours: string[], valeurs: Map<string, number>): PointJour[] => jours.map((date) => ({ date, label: libelleJourCourt(date), valeur: valeurs.get(date) ?? 0 }))

export const somme = (a: number[]): number => a.reduce((t, x) => t + x, 0)
export const moyenne = (a: number[]): number => (a.length ? somme(a) / a.length : 0)
export const evolution = (actuel: number, precedent: number): number | null => (precedent === 0 ? (actuel === 0 ? 0 : null) : Math.round(((actuel - precedent) * 100) / precedent))
export const pourcent = (partie: number, tout: number): number | null => (tout > 0 ? Math.round((partie * 1000) / tout) / 10 : null)

export type LignePareto = { nom: string; valeur: number; cumulPct: number }
export function pareto(items: { nom: string; valeur: number }[]): LignePareto[] {
  const tri = items.filter((i) => i.valeur > 0).sort((a, b) => b.valeur - a.valeur || a.nom.localeCompare(b.nom, "fr"))
  const total = somme(tri.map((i) => i.valeur))
  let cumul = 0
  return tri.map((i) => {
    cumul += i.valeur
    return { nom: i.nom, valeur: i.valeur, cumulPct: Math.round((cumul * 1000) / total) / 10 }
  })
}

const fmt = (n: number): string => new Intl.NumberFormat("fr-FR").format(n)
// Repartition en tranches : [0, 1000] donne "≤ 0", "1 – 1 000" et "> 1 000".
export function tranches(valeurs: number[], bornes: number[]): { label: string; n: number }[] {
  const res = [{ label: "≤ " + fmt(bornes[0]), n: 0 }]
  for (let i = 1; i < bornes.length; i++) res.push({ label: fmt(bornes[i - 1] + 1) + " – " + fmt(bornes[i]), n: 0 })
  res.push({ label: "> " + fmt(bornes[bornes.length - 1]), n: 0 })
  for (const v of valeurs) {
    let k = bornes.findIndex((b) => v <= b)
    if (k === -1) k = bornes.length
    res[k].n += 1
  }
  return res
}

// Droite des moindres carres : pente par point et variation relative sur toute la fenetre.
export function tendance(valeurs: number[]): { pente: number; moyenne: number; variationPct: number | null } {
  const n = valeurs.length
  const m = moyenne(valeurs)
  if (n < 2) return { pente: 0, moyenne: m, variationPct: null }
  const xm = (n - 1) / 2
  let num = 0
  let den = 0
  valeurs.forEach((y, x) => {
    num += (x - xm) * (y - m)
    den += (x - xm) ** 2
  })
  const pente = den === 0 ? 0 : num / den
  return { pente, moyenne: m, variationPct: m > 0 ? Math.round((pente * (n - 1) * 100) / m) : null }
}

export const heatmapNiveau = (valeur: number, max: number): 0 | 1 | 2 | 3 | 4 => {
  if (max <= 0 || valeur <= 0) return 0
  const r = valeur / max
  return r < 0.25 ? 1 : r < 0.5 ? 2 : r < 0.75 ? 3 : 4
}

export type CaseCalendrier = { date: string; valeur: number; niveau: 0 | 1 | 2 | 3 | 4 }
// Calendrier thermique : une colonne par semaine (lundi a dimanche), null hors de la periode.
export function calendrier(jours: string[], valeurs: Map<string, number>): { semaines: (CaseCalendrier | null)[][]; max: number } {
  const max = jours.reduce((m, d) => Math.max(m, valeurs.get(d) ?? 0), 0)
  const plat: (CaseCalendrier | null)[] = jours.length ? Array(jourSemaine(jours[0])).fill(null) : []
  for (const date of jours) {
    const valeur = valeurs.get(date) ?? 0
    plat.push({ date, valeur, niveau: heatmapNiveau(valeur, max) })
  }
  while (plat.length % 7 !== 0) plat.push(null)
  const semaines: (CaseCalendrier | null)[][] = []
  for (let i = 0; i < plat.length; i += 7) semaines.push(plat.slice(i, i + 7))
  return { semaines, max }
}

export type TableExport = { nom: string; colonnes: string[]; lignes: (string | number | null)[][] }
// Une cellule qui commencerait par = + - @ serait interpretee comme une formule par un tableur : on la neutralise.
export function cellule(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : ""
  let s = v.replace(/\r?\n/g, " ")
  if (/^[=+\-@\t]/.test(s)) s = "'" + s
  return /[;"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
export const versCsv = (colonnes: string[], lignes: (string | number | null)[][]): string => "\uFEFF" + [colonnes, ...lignes].map((l) => l.map(cellule).join(";")).join("\r\n") + "\r\n"