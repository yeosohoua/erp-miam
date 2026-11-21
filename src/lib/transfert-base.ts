const arrondi4 = (n: number): number => Math.round((n + Number.EPSILON) * 10000) / 10000
const q3 = (n: number): number => Math.round((n + Number.EPSILON) * 1000) / 1000

export const STATUTS_TRANSFERT = { PREPARE: "Préparé", EXPEDIE: "Expédié", RECU: "Reçu", ANNULE: "Annulé" } as const

export const referenceTransfert = (code: string, numero: number): string => "TR-" + code + "-" + numero
export const noteSortie = (code: string, numero: number): string => "Transfert " + code + "-" + numero

// Cout moyen pondere par les quantites reellement sorties des lots.
export function coutMoyenPondere(items: { quantite: number; prix: number }[]): number {
  const total = items.reduce((s, i) => s + i.quantite, 0)
  if (total <= 0) return 0
  return arrondi4(items.reduce((s, i) => s + i.quantite * i.prix, 0) / total)
}

// Regroupe les quantites sorties par lot (pour recreer les lots a destination avec leur peremption).
export function regrouperParLot(items: { lotId: string | null; quantite: number }[]): Map<string | null, number> {
  const m = new Map<string | null, number>()
  for (const i of items) m.set(i.lotId, q3((m.get(i.lotId) ?? 0) + i.quantite))
  return m
}