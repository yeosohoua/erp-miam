import "server-only"

import { ajouterJours, lundiDe } from "@/lib/menus"
import { proposerMenus, type Proposition } from "@/lib/nutrition-base"
import { chargerPlats } from "@/lib/nutrition"

export type ParamsCalcul = { service: string; debut: string; budget: number | null; exclus: string[] }

// Propose un plat par jour (lundi a samedi) pour la semaine du "debut".
export async function calculerPropositions(etabId: string, p: ParamsCalcul): Promise<Proposition[]> {
  const plats = (await chargerPlats(etabId)).filter((x) => x.nbLignes > 0 && x.manquants === 0)
  const debut = lundiDe(p.debut)
  const dates = [0, 1, 2, 3, 4, 5].map((i) => ajouterJours(debut, i))
  return proposerMenus(
    plats.map((x) => ({ id: x.id, nom: x.nom, valeurs: x.parPortion, cout: x.cout, allergenes: x.allergenes, antiGaspi: x.antiGaspi })),
    { service: p.service, dates, budget: p.budget, exclus: p.exclus },
  )
}