export const TYPES_MOUVEMENT = { ENTREE: "Entrée", SORTIE: "Sortie", PERTE: "Perte", INVENTAIRE: "Inventaire" } as const
export type TypeMouvement = keyof typeof TYPES_MOUVEMENT

export const STATUTS_BON = { DRAFT: "Brouillon", SENT: "Envoyé", PARTIAL: "Reçu partiellement", RECEIVED: "Reçu", CANCELLED: "Annulé" } as const
export type StatutBon = keyof typeof STATUTS_BON

// Un lot est signale "bientot perime" a moins de ce nombre de jours.
export const JOURS_ALERTE = 7

// Quantite : 3 decimales maximum, 7 chiffres entiers maximum. zeroOk : accepte 0.
export function parseQuantite(v: string, zeroOk = false): number | null {
  const s = v.trim().replace(",", ".")
  if (!/^\d{1,7}(\.\d{1,3})?$/.test(s)) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  if (n === 0 && !zeroOk) return null
  return n
}

export const q3 = (n: number): number => Math.round((n + Number.EPSILON) * 1000) / 1000

export const numeroBon = (n: number | null): string => (n === null ? "Brouillon" : "BC-" + String(n).padStart(5, "0"))