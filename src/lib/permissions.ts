export function hasRole(role: string, autorises: readonly string[]): boolean {
  return autorises.includes(role)
}

export const INSCRITS_LECTURE = ["ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"] as const
export const MENUS_LECTURE = ["ADMIN", "MANAGER", "CHEF", "STOREKEEPER"] as const
export const RESERVATIONS_LECTURE = ["ADMIN", "MANAGER", "CASHIER", "CHEF"] as const
export const SERVICE_LECTURE = ["ADMIN", "MANAGER", "CASHIER", "CHEF"] as const
export const PAIEMENTS_LECTURE = ["ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"] as const
export const FACTURATION_LECTURE = ["ADMIN", "MANAGER", "ACCOUNTANT"] as const
export const COMPTA_LECTURE = ["ADMIN", "MANAGER", "ACCOUNTANT"] as const
export const STOCK_LECTURE = ["ADMIN", "MANAGER", "CHEF", "STOREKEEPER", "PURCHASER"] as const
export const ACHATS_LECTURE = ["ADMIN", "MANAGER", "PURCHASER", "STOREKEEPER", "ACCOUNTANT"] as const
export const RH_LECTURE = ["ADMIN", "MANAGER", "HR", "ACCOUNTANT"] as const
export const PARAMETRES_LECTURE = ["ADMIN", "MANAGER"] as const
export const PARAMETRES_ADMIN = ["ADMIN"] as const
export const ETABLISSEMENTS_ADMIN = ["ADMIN"] as const
export const ETABLISSEMENT_EDITION = ["ADMIN", "MANAGER"] as const
export const UTILISATEURS_ADMIN = ["ADMIN"] as const
export const INSCRITS_ECRITURE = ["ADMIN", "MANAGER"] as const
export const SAUVEGARDE_ADMIN = ["ADMIN"] as const
export const AUDIT_LECTURE = ["ADMIN"] as const
export const MENUS_ECRITURE = ["ADMIN", "MANAGER", "CHEF"] as const
export const RESERVATIONS_ECRITURE = ["ADMIN", "MANAGER", "CASHIER"] as const
export const PAIEMENTS_ECRITURE = ["ADMIN", "MANAGER", "CASHIER"] as const
export const PAIEMENTS_CONFIG = ["ADMIN", "MANAGER"] as const
export const FAMILLE_ACCES = ["PARENT"] as const
export const FACTURATION_ECRITURE = ["ADMIN", "MANAGER", "ACCOUNTANT"] as const
export const STOCK_ECRITURE = ["ADMIN", "MANAGER", "STOREKEEPER"] as const
export const ACHATS_ECRITURE = ["ADMIN", "MANAGER", "PURCHASER"] as const
export const RECEPTION_ECRITURE = ["ADMIN", "MANAGER", "STOREKEEPER"] as const
export const NOTIFICATIONS_ECRITURE = ["ADMIN", "MANAGER"] as const
export const COMPTA_ECRITURE = ["ADMIN", "MANAGER", "ACCOUNTANT"] as const
export const COMPTA_CLOTURE = ["ADMIN", "ACCOUNTANT"] as const
export const RH_ECRITURE = ["ADMIN", "MANAGER", "HR"] as const
export const PAIE_LECTURE = ["ADMIN", "MANAGER", "HR", "ACCOUNTANT"] as const
export const PAIE_VALIDATION = ["ADMIN", "MANAGER", "ACCOUNTANT"] as const
export const PRODUCTION_LECTURE = ["ADMIN", "MANAGER", "CHEF", "STOREKEEPER", "PURCHASER"] as const
export const PRODUCTION_ECRITURE = ["ADMIN", "MANAGER", "CHEF"] as const
export const PRODUCTION_ADMIN = ["ADMIN", "MANAGER"] as const
export const PRODUCTION_COMMANDE = ["ADMIN", "MANAGER", "PURCHASER"] as const
export const CAISSE_ACCES = ["ADMIN", "MANAGER", "CASHIER"] as const
export const CAISSE_CONFIG = ["ADMIN", "MANAGER"] as const
export const CAISSE_ANNULATION = ["ADMIN", "MANAGER"] as const
export const ANALYTICS_LECTURE = ["ADMIN", "MANAGER", "ACCOUNTANT", "CHEF"] as const

// ---- Aides et tarifs sociaux ----
export const AIDES_LECTURE = ["ADMIN", "MANAGER"] as const
export const AIDES_ECRITURE = ["ADMIN", "MANAGER"] as const
// ---- RH avancees (conges, pointages, certifications) ----
export const CONGES_LECTURE = ["ADMIN", "MANAGER", "HR", "ACCOUNTANT"] as const
export const CONGES_ECRITURE = ["ADMIN", "MANAGER", "HR"] as const
// ---- Satisfaction et participation ----
export const SATISFACTION_LECTURE = ["ADMIN", "MANAGER", "CHEF", "CASHIER"] as const
export const SATISFACTION_SAISIE = ["ADMIN", "MANAGER", "CHEF", "CASHIER"] as const
export const SATISFACTION_TRAITEMENT = ["ADMIN", "MANAGER"] as const
// ---- Nutrition et menus intelligents ----
export const NUTRITION_LECTURE = ["ADMIN", "MANAGER", "CHEF", "STOREKEEPER"] as const
export const NUTRITION_ECRITURE = ["ADMIN", "MANAGER", "CHEF"] as const
// ---- Hygiene et tracabilite (HACCP) ----
export const HACCP_LECTURE = ["ADMIN", "MANAGER", "CHEF", "STOREKEEPER"] as const
export const HACCP_ECRITURE = ["ADMIN", "MANAGER", "CHEF", "STOREKEEPER"] as const
export const HACCP_ADMIN = ["ADMIN", "MANAGER"] as const
// ---- Pilotage et integration ----
export const PILOTAGE_LECTURE = ["ADMIN", "MANAGER", "ACCOUNTANT"] as const
export const PILOTAGE_ADMIN = ["ADMIN", "MANAGER"] as const
export const API_ADMIN = ["ADMIN"] as const
// ---- Reapprovisionnement automatique et cuisine centrale ----
export const REAPPRO_LECTURE = ["ADMIN", "MANAGER", "PURCHASER", "STOREKEEPER", "CHEF"] as const
export const REAPPRO_ECRITURE = ["ADMIN", "MANAGER", "PURCHASER"] as const
export const CUISINE_CENTRALE = ["ADMIN", "MANAGER", "CHEF", "STOREKEEPER"] as const