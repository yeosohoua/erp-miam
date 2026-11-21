export const TYPES_CONGE = ["ANNUEL", "MALADIE", "MATERNITE", "PERMISSION", "SANS_SOLDE"] as const
export type TypeCongeCle = (typeof TYPES_CONGE)[number]
export const LIBELLES_CONGE: Record<TypeCongeCle, string> = {
  ANNUEL: "Congé annuel",
  MALADIE: "Maladie",
  MATERNITE: "Maternité",
  PERMISSION: "Permission exceptionnelle",
  SANS_SOLDE: "Sans solde",
}

export const STATUTS_POINTAGE = ["PRESENT", "ABSENT", "RETARD"] as const
export type StatutPointageCle = (typeof STATUTS_POINTAGE)[number]
export const LIBELLES_POINTAGE: Record<StatutPointageCle, string> = { PRESENT: "Présent", ABSENT: "Absent", RETARD: "En retard" }

export const TYPES_CERTIFICATION = ["VISITE_MEDICALE", "FORMATION_HYGIENE", "HACCP", "PREMIERS_SECOURS"] as const
export type TypeCertificationCle = (typeof TYPES_CERTIFICATION)[number]
export const LIBELLES_CERTIFICATION: Record<TypeCertificationCle, string> = {
  VISITE_MEDICALE: "Visite médicale",
  FORMATION_HYGIENE: "Formation hygiène",
  HACCP: "Formation HACCP",
  PREMIERS_SECOURS: "Premiers secours",
}

// 2,2 jours ouvrables par mois complet de service, comptes en dixiemes de jour pour rester en entiers.
export const DIXIEMES_PAR_MOIS = 22
export const SEUIL_ALERTE_JOURS = 60

function lire(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(t)
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null
  return t
}

// Jours ouvrables : du lundi au samedi (le dimanche est exclu).
export function joursOuvrables(debut: string, fin: string): number {
  const a = lire(debut)
  const b = lire(fin)
  if (a === null || b === null || b < a || (b - a) / 864e5 > 400) return 0
  let n = 0
  for (let t = a; t <= b; t += 864e5) if (new Date(t).getUTCDay() !== 0) n++
  return n
}

export function moisCompletes(embauche: string, jour: string): number {
  const a = lire(embauche)
  const b = lire(jour)
  if (a === null || b === null || b < a) return 0
  const x = new Date(a)
  const y = new Date(b)
  let mois = (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth())
  if (y.getUTCDate() < x.getUTCDate()) mois--
  return Math.max(0, mois)
}

export const acquisDixiemes = (embauche: string, jour: string): number => moisCompletes(embauche, jour) * DIXIEMES_PAR_MOIS

export type CongeCalcul = { type: string; statut: string; jours: number }
export type SoldeConges = { acquis: number; pris: number; enAttente: number; disponible: number }

// Valeurs en dixiemes de jour. Seul le conge annuel consomme le solde ; les demandes en attente reservent des jours.
export function soldeConges(embauche: string, jour: string, conges: CongeCalcul[]): SoldeConges {
  const acquis = acquisDixiemes(embauche, jour)
  let pris = 0
  let enAttente = 0
  for (const c of conges) {
    if (c.type !== "ANNUEL") continue
    if (c.statut === "APPROUVE") pris += c.jours * 10
    else if (c.statut === "DEMANDE") enAttente += c.jours * 10
  }
  return { acquis, pris, enAttente, disponible: acquis - pris - enAttente }
}

export const formaterJours = (dixiemes: number): string => (dixiemes / 10).toFixed(1).replace(".", ",")

export type StatutCertification = "VALIDE" | "BIENTOT" | "EXPIREE"

export function joursAvant(iso: string, jour: string): number | null {
  const a = lire(iso)
  const b = lire(jour)
  return a === null || b === null ? null : Math.round((a - b) / 864e5)
}

export function statutCertification(expireLe: string, jour: string): StatutCertification {
  const r = joursAvant(expireLe, jour)
  if (r === null) return "VALIDE"
  if (r < 0) return "EXPIREE"
  return r <= SEUIL_ALERTE_JOURS ? "BIENTOT" : "VALIDE"
}