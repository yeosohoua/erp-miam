import type { ServiceMenu } from "@/lib/menus"

export type ScanResultat = {
  at: number
  statut: "SERVI" | "DEJA" | "SANS_RESERVATION" | "SOLDE_INSUFFISANT" | "INCONNU" | "INACTIF" | "FERME" | "ERREUR"
  message: string
  inscrit?: { id: string; nom: string; matricule: string; groupe: string | null; regime: string | null; allergies: string[] }
  heure?: string
  paiement?: string
  horsLigne?: boolean
}
export type ResultatScan = ScanResultat | undefined

// Le service propose par defaut suit l'heure d'Abidjan (UTC).
export function serviceParDefaut(): ServiceMenu {
  const h = new Date().getUTCHours()
  return h < 10 ? "BREAKFAST" : h < 15 ? "LUNCH" : h < 18 ? "SNACK" : "DINNER"
}
export const formaterHeure = (d: Date): string => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" }).format(d)