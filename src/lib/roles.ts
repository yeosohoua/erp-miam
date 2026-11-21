export const ROLE_VALUES = ["ADMIN", "MANAGER", "ACCOUNTANT", "CASHIER", "CHEF", "STOREKEEPER", "PURCHASER", "HR", "PARENT", "ELEVE", "EMPLOYE"] as const

export type RoleValue = (typeof ROLE_VALUES)[number]

export const LIBELLES_ROLES: Record<RoleValue, string> = {
  ADMIN: "Administrateur",
  MANAGER: "Responsable",
  ACCOUNTANT: "Comptable",
  CASHIER: "Caissier",
  CHEF: "Chef de cuisine",
  STOREKEEPER: "Magasinier",
  PURCHASER: "Acheteur",
  HR: "Ressources humaines",
  PARENT: "Parent",
  ELEVE: "Inscrit (élève ou personnel)",
  EMPLOYE: "Employé",
}