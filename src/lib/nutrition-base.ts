export type Valeurs = { kcal: number; proteines: number; glucides: number; lipides: number; fibres: number }

export const VIDE: Valeurs = { kcal: 0, proteines: 0, glucides: 0, lipides: 0, fibres: 0 }

const arrondir = (n: number): number => Math.round(n * 10) / 10

export function additionner(a: Valeurs, b: Valeurs): Valeurs {
  return {
    kcal: a.kcal + b.kcal,
    proteines: a.proteines + b.proteines,
    glucides: a.glucides + b.glucides,
    lipides: a.lipides + b.lipides,
    fibres: a.fibres + b.fibres,
  }
}

export function arrondirValeurs(v: Valeurs): Valeurs {
  return { kcal: Math.round(v.kcal), proteines: arrondir(v.proteines), glucides: arrondir(v.glucides), lipides: arrondir(v.lipides), fibres: arrondir(v.fibres) }
}

// Convertit une quantite en grammes (null si l'unite est inconnue, ex. "piece").
export function enGrammes(quantite: number, unite: string, densite: number = 1): number | null {
  const u = unite.trim().toLowerCase()
  if (u === "kg") return quantite * 1000
  if (u === "g") return quantite
  if (u === "l" || u === "litre" || u === "litres") return quantite * 1000 * densite
  if (u === "ml") return quantite * densite
  return null
}

export type LigneNutrition = { quantite: number; unite: string; densite: number; valeurs: Valeurs | null }

// Valeurs d'un plat PAR PORTION (valeurs des ingredients exprimees pour 100 g).
export function nutritionPlat(lignes: LigneNutrition[], portions: number): { parPortion: Valeurs; manquants: number } {
  const nb = portions > 0 ? portions : 1
  let total: Valeurs = { ...VIDE }
  let manquants = 0
  for (const l of lignes) {
    const g = enGrammes(l.quantite, l.unite, l.densite)
    if (!l.valeurs || g === null) {
      manquants += 1
      continue
    }
    const f = g / 100
    total = additionner(total, {
      kcal: l.valeurs.kcal * f,
      proteines: l.valeurs.proteines * f,
      glucides: l.valeurs.glucides * f,
      lipides: l.valeurs.lipides * f,
      fibres: l.valeurs.fibres * f,
    })
  }
  return {
    parPortion: arrondirValeurs({ kcal: total.kcal / nb, proteines: total.proteines / nb, glucides: total.glucides / nb, lipides: total.lipides / nb, fibres: total.fibres / nb }),
    manquants,
  }
}

export const CIBLES: Record<string, { kcalMin: number; kcalMax: number; fibresMin: number }> = {
  BREAKFAST: { kcalMin: 250, kcalMax: 500, fibresMin: 3 },
  LUNCH: { kcalMin: 550, kcalMax: 900, fibresMin: 6 },
  SNACK: { kcalMin: 100, kcalMax: 300, fibresMin: 1 },
  DINNER: { kcalMin: 450, kcalMax: 800, fibresMin: 5 },
}

export function evaluerRepas(service: string, v: Valeurs): { score: number; alertes: string[] } {
  const cible = CIBLES[service] ?? CIBLES.LUNCH
  const alertes: string[] = []
  if (v.kcal <= 0) return { score: 0, alertes: ["Aucune donnée nutritionnelle."] }
  let score = 100
  if (v.kcal < cible.kcalMin) {
    score -= 30
    alertes.push("Apport énergétique faible (" + Math.round(v.kcal) + " kcal).")
  } else if (v.kcal > cible.kcalMax) {
    score -= 30
    alertes.push("Apport énergétique élevé (" + Math.round(v.kcal) + " kcal).")
  }
  const partProt = (v.proteines * 4) / v.kcal
  if (partProt < 0.1) {
    score -= 20
    alertes.push("Protéines insuffisantes.")
  } else if (partProt > 0.35) {
    score -= 10
    alertes.push("Protéines très élevées.")
  }
  const partLip = (v.lipides * 9) / v.kcal
  if (partLip > 0.35) {
    score -= 15
    alertes.push("Trop de lipides.")
  }
  if (v.fibres < cible.fibresMin) {
    score -= 15
    alertes.push("Fibres insuffisantes.")
  }
  return { score: Math.max(0, Math.min(100, score)), alertes }
}

export type Candidat = { id: string; nom: string; valeurs: Valeurs; cout: number; allergenes: string[]; antiGaspi: number }
export type ParamsPropositions = { service: string; dates: string[]; budget: number | null; exclus: string[] }
export type Proposition = { date: string; platId: string; nom: string; score: number; kcal: number; cout: number; antiGaspi: number }

export function proposerMenus(candidats: Candidat[], p: ParamsPropositions): Proposition[] {
  const exclus = new Set(p.exclus)
  const retenus = candidats.filter((c) => c.valeurs.kcal > 0 && (p.budget === null || c.cout <= p.budget) && !c.allergenes.some((a) => exclus.has(a)))
  if (retenus.length === 0) return []
  const utilises = new Map<string, number>()
  const sortie: Proposition[] = []
  for (const date of p.dates) {
    let meilleur: Candidat | null = null
    let meilleurScore = -Infinity
    for (const c of retenus) {
      const s = evaluerRepas(p.service, c.valeurs).score + Math.min(c.antiGaspi, 3) * 5 - (utilises.get(c.id) ?? 0) * 20
      if (s > meilleurScore || (s === meilleurScore && meilleur !== null && c.nom < meilleur.nom)) {
        meilleur = c
        meilleurScore = s
      }
    }
    if (!meilleur) continue
    utilises.set(meilleur.id, (utilises.get(meilleur.id) ?? 0) + 1)
    sortie.push({ date, platId: meilleur.id, nom: meilleur.nom, score: evaluerRepas(p.service, meilleur.valeurs).score, kcal: meilleur.valeurs.kcal, cout: meilleur.cout, antiGaspi: meilleur.antiGaspi })
  }
  return sortie
}