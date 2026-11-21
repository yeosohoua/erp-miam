const q3 = (n: number): number => Math.round((n + Number.EPSILON) * 1000) / 1000

// Quantite a commander pour revenir a la cible, en comptant ce qui est deja en stock et deja commande.
export function quantiteACommander(p: { stock: number; enCommande: number; cible: number }): number {
  return Math.max(0, q3(p.cible - p.stock - p.enCommande))
}

export function grouperParFournisseur<T extends { fournisseurId: string | null }>(lignes: T[]): { groupes: Map<string, T[]>; sansFournisseur: T[] } {
  const groupes = new Map<string, T[]>()
  const sansFournisseur: T[] = []
  for (const l of lignes) {
    if (!l.fournisseurId) {
      sansFournisseur.push(l)
      continue
    }
    groupes.set(l.fournisseurId, [...(groupes.get(l.fournisseurId) ?? []), l])
  }
  return { groupes, sansFournisseur }
}

export const NOTE_REAPPRO = "Réapprovisionnement automatique"