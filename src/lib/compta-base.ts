import { libellePeriode } from "@/lib/facturation-base"

export const JOURNAUX = { VE: "Ventes", AC: "Achats", CA: "Caisse", BQ: "Banque et Mobile Money", OD: "Opérations diverses" } as const
export type Journal = keyof typeof JOURNAUX
export const ORDRE_JOURNAUX: Journal[] = ["VE", "AC", "CA", "BQ", "OD"]

// Plan comptable SYSCOHADA (revise), restreint aux operations d'une cantine.
const COMPTES: [string, string][] = [
  ["101", "Capital social"],
  ["110", "Report à nouveau"],
  ["321", "Matières premières et fournitures liées (denrées)"],
  ["401", "Fournisseurs"],
  ["4191", "Clients — avances et acomptes reçus (comptes prépayés)"],
  ["411", "Clients"],
  ["421", "Personnel — rémunérations dues"],
  ["431", "Sécurité sociale"],
  ["447", "État — impôts retenus à la source"],
  ["5211", "Banque — Paystack"],
  ["5212", "Mobile Money (Orange, MTN, Wave, Moov)"],
  ["571", "Caisse"],
  ["602", "Achats de matières premières et fournitures liées"],
  ["6032", "Variation des stocks de matières premières"],
  ["605", "Autres achats (eau, gaz, électricité)"],
  ["622", "Locations et charges locatives"],
  ["631", "Frais bancaires"],
  ["641", "Impôts et taxes directs sur rémunérations (taxes patronales)"],
  ["658", "Charges diverses (pertes, gestes commerciaux)"],
  ["661", "Rémunérations directes du personnel"],
  ["664", "Charges sociales (cotisations patronales)"],
  ["706", "Services vendus (restauration)"],
  ["758", "Produits divers"],
]
export const PLAN: Record<string, string> = Object.fromEntries(COMPTES)
export const LISTE_COMPTES: { numero: string; libelle: string }[] = COMPTES.map(([numero, libelle]) => ({ numero, libelle }))
export const libelleCompte = (numero: string): string => (Object.hasOwn(PLAN, numero) ? PLAN[numero] : "Compte inconnu")

export const numeroEcriture = (n: number): string => "EC-" + String(n).padStart(6, "0")
export const moisValide = (v: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(v) && v >= "2000-01"

export function moisSuivant(p: string): string {
  const [a, m] = p.split("-").map(Number)
  return m === 12 ? a + 1 + "-01" : a + "-" + String(m + 1).padStart(2, "0")
}
export function moisPrecedent(p: string): string {
  const [a, m] = p.split("-").map(Number)
  return m === 1 ? a - 1 + "-12" : a + "-" + String(m - 1).padStart(2, "0")
}

// Compte de tresorerie et journal selon le mode de paiement.
export function tresorerie(methode: string | null): { compte: string; journal: Journal } {
  if (methode === null || methode === "CASH") return { compte: "571", journal: "CA" }
  if (methode === "PAYSTACK") return { compte: "5211", journal: "BQ" }
  return { compte: "5212", journal: "BQ" }
}

// Une piece dont la date tombe dans un mois deja cloture est rattachee au premier jour du mois ouvert.
export function ajusterDate(iso: string, derniere: string | null): { date: string; decale: boolean } {
  if (derniere && iso.slice(0, 7) <= derniere) return { date: moisSuivant(derniere) + "-01", decale: true }
  return { date: iso, decale: false }
}

export type Plage = { code: string; debut: string; fin: string; libelle: string }
export function plageDe(code: string, jour: string): Plage {
  if (code === "tout") return { code, debut: "2000-01-01", fin: "2999-12-31", libelle: "Toutes les périodes" }
  if (moisValide(code)) return { code, debut: code + "-01", fin: moisSuivant(code) + "-01", libelle: libellePeriode(code) }
  const an = /^\d{4}$/.test(code) && code >= "2000" && code <= "2900" ? code : jour.slice(0, 4)
  return { code: an, debut: an + "-01-01", fin: Number(an) + 1 + "-01-01", libelle: "Année " + an }
}