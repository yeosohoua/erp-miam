import type { AuthMobile } from "@/lib/mobile-auth"

export type ModeRepas = "RESERVER" | "PANIER"

// Les comptes cantine (parent, eleve) sont les abonnes : ils reservent leurs repas.
// Tous les autres comptes (employes) ajoutent le repas au panier, paye au retrait. Regle a ajuster ici uniquement.
export const modeRepas = (a: AuthMobile): ModeRepas => (a.role === "PARENT" || a.role === "ELEVE" ? "RESERVER" : "PANIER")