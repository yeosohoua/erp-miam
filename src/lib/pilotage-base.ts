export type KpiId = "repas_servis" | "cout_repas" | "satisfaction" | "conformite_temperatures" | "factures_retard" | "nc_ouvertes" | "stock_critique"
export type SensKpi = "MIN" | "MAX"

export type DefinitionKpi = { id: KpiId; libelle: string; unite: string; sens: SensKpi; decimales: number }

// MAX : plus la valeur est haute, mieux c'est. MIN : plus elle est basse, mieux c'est.
export const KPIS: DefinitionKpi[] = [
  { id: "repas_servis", libelle: "Repas servis (30 jours)", unite: "repas", sens: "MAX", decimales: 0 },
  { id: "cout_repas", libelle: "Coût matière par repas (30 jours)", unite: "FCFA", sens: "MIN", decimales: 0 },
  { id: "satisfaction", libelle: "Satisfaction moyenne (30 jours)", unite: "/ 5", sens: "MAX", decimales: 1 },
  { id: "conformite_temperatures", libelle: "Relevés de température conformes (7 jours)", unite: "%", sens: "MAX", decimales: 0 },
  { id: "factures_retard", libelle: "Factures en retard de paiement", unite: "", sens: "MIN", decimales: 0 },
  { id: "nc_ouvertes", libelle: "Non-conformités ouvertes", unite: "", sens: "MIN", decimales: 0 },
  { id: "stock_critique", libelle: "Ingrédients sous le seuil de stock", unite: "", sens: "MIN", decimales: 0 },
]

export function definitionKpi(id: string): DefinitionKpi | null {
  return KPIS.find((k) => k.id === id) ?? null
}

export type StatutObjectif = "ATTEINT" | "PROCHE" | "ECART" | "SANS_DONNEE"
export const LIBELLES_STATUT_OBJECTIF: Record<StatutObjectif, string> = { ATTEINT: "Atteint", PROCHE: "Proche", ECART: "À améliorer", SANS_DONNEE: "Pas de donnée" }

// Proche = moins de 10 % d'ecart avec la cible.
export function statutObjectif(valeur: number | null, cible: number, sens: SensKpi): StatutObjectif {
  if (valeur === null) return "SANS_DONNEE"
  if (sens === "MAX") {
    if (valeur >= cible) return "ATTEINT"
    return valeur >= cible * 0.9 ? "PROCHE" : "ECART"
  }
  if (valeur <= cible) return "ATTEINT"
  if (cible === 0) return "ECART"
  return valeur <= cible * 1.1 ? "PROCHE" : "ECART"
}

export function formaterValeur(valeur: number | null, decimales: number, unite: string): string {
  if (valeur === null) return "—"
  const n = valeur.toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
  return unite ? n + " " + unite : n
}

export type GraviteAlerte = "CRITIQUE" | "IMPORTANT" | "INFO"
export type Alerte = { code: string; gravite: GraviteAlerte; titre: string; detail: string; lien: string }
export const LIBELLES_GRAVITE_ALERTE: Record<GraviteAlerte, string> = { CRITIQUE: "Critique", IMPORTANT: "Important", INFO: "À suivre" }
const ORDRE: Record<GraviteAlerte, number> = { CRITIQUE: 0, IMPORTANT: 1, INFO: 2 }

export function trierAlertes(alertes: Alerte[]): Alerte[] {
  return [...alertes].sort((a, b) => ORDRE[a.gravite] - ORDRE[b.gravite] || a.titre.localeCompare(b.titre, "fr"))
}