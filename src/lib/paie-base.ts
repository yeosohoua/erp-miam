// Calcul de paie ivoirien : fonctions pures, sans acces base de donnees.
export const SITUATIONS = { CELIBATAIRE: "Célibataire", MARIE: "Marié(e)", DIVORCE: "Divorcé(e)", VEUF: "Veuf / veuve" } as const
export type Situation = keyof typeof SITUATIONS
export const ORDRE_SITUATIONS: Situation[] = ["CELIBATAIRE", "MARIE", "DIVORCE", "VEUF"]

export type ParamsPaie = {
  retraiteSalarieBp: number
  retraitePatronalBp: number
  pfBp: number
  materniteBp: number
  atBp: number
  plafondRetraite: number
  plafondAutres: number
  plancher: number
  cmuSalarie: number
  cmuPatronale: number
  contributionBp: number
  apprentissageBp: number
  tfpcBp: number
  ricfDemiPart: number
  cnpsDeductibleIts: boolean
}

export const PARAMS_DEFAUT: ParamsPaie = {
  retraiteSalarieBp: 630,
  retraitePatronalBp: 770,
  pfBp: 500,
  materniteBp: 75,
  atBp: 200,
  plafondRetraite: 3_375_000,
  plafondAutres: 75_000,
  plancher: 75_000,
  cmuSalarie: 500,
  cmuPatronale: 500,
  contributionBp: 120,
  apprentissageBp: 40,
  tfpcBp: 120,
  ricfDemiPart: 5500,
  cnpsDeductibleIts: false,
}

export type EntreePaie = { salaireBase: number; primes: number; indemniteExoneree: number; situation: Situation; enfants: number; personnesCmu: number }

export type ResultatPaie = {
  brut: number
  partsX2: number
  baseRetraite: number
  baseAutres: number
  retraiteSalarie: number
  cmuSalarie: number
  baseIts: number
  itsBrut: number
  ricf: number
  its: number
  net: number
  retraitePatronale: number
  pf: number
  maternite: number
  at: number
  cmuPatronale: number
  taxesPatronales: number
  chargesPatronales: number
  coutEmployeur: number
}

// Plafond mensuel de chaque tranche et taux en %, barème unifié de l'ITS.
export const TRANCHES_ITS: [number, number][] = [
  [75_000, 0],
  [240_000, 16],
  [800_000, 21],
  [2_400_000, 24],
  [8_000_000, 28],
  [Number.POSITIVE_INFINITY, 32],
]

const bp = (base: number, taux: number): number => Math.round((base * taux) / 10_000)

export function itsBrut(base: number): number {
  let precedent = 0
  let total = 0
  for (const [plafond, pct] of TRANCHES_ITS) {
    if (base <= precedent) break
    total += (Math.min(base, plafond) - precedent) * pct
    precedent = plafond
  }
  return Math.round(total / 100)
}

// Nombre de parts (multiple de 0,5, 5 au maximum) : célibataire ou divorcé 1 (1,5 avec enfant), marié 2, veuf 1 (2 avec enfant), plus 0,5 par enfant.
export function partsDe(situation: Situation, enfants: number): number {
  const base = situation === "MARIE" ? 2 : situation === "VEUF" ? (enfants > 0 ? 2 : 1) : enfants > 0 ? 1.5 : 1
  return Math.min(5, base + 0.5 * enfants)
}

export function calculerPaie(e: EntreePaie, p: ParamsPaie): ResultatPaie {
  const brut = e.salaireBase + e.primes
  const baseRetraite = Math.min(Math.max(brut, p.plancher), p.plafondRetraite)
  const baseAutres = Math.min(Math.max(brut, p.plancher), p.plafondAutres)
  const retraiteSalarie = bp(baseRetraite, p.retraiteSalarieBp)
  const cmuSalarie = p.cmuSalarie * e.personnesCmu
  const imposable = Math.max(0, brut - e.indemniteExoneree)
  const baseIts = Math.max(0, imposable - (p.cnpsDeductibleIts ? retraiteSalarie : 0))
  const parts = partsDe(e.situation, e.enfants)
  const partsX2 = Math.round(parts * 2)
  const brutIts = itsBrut(baseIts)
  const ricf = Math.round((parts - 1) * 2) * p.ricfDemiPart
  const its = Math.max(0, brutIts - ricf)
  const net = brut - retraiteSalarie - cmuSalarie - its

  const retraitePatronale = bp(baseRetraite, p.retraitePatronalBp)
  const pf = bp(baseAutres, p.pfBp)
  const maternite = bp(baseAutres, p.materniteBp)
  const at = bp(baseAutres, p.atBp)
  const cmuPatronale = p.cmuPatronale * e.personnesCmu
  const taxesPatronales = bp(imposable, p.contributionBp) + bp(imposable, p.apprentissageBp) + bp(imposable, p.tfpcBp)
  const chargesPatronales = retraitePatronale + pf + maternite + at + cmuPatronale
  return {
    brut,
    partsX2,
    baseRetraite,
    baseAutres,
    retraiteSalarie,
    cmuSalarie,
    baseIts,
    itsBrut: brutIts,
    ricf,
    its,
    net,
    retraitePatronale,
    pf,
    maternite,
    at,
    cmuPatronale,
    taxesPatronales,
    chargesPatronales,
    coutEmployeur: brut + chargesPatronales + taxesPatronales,
  }
}