import type { Valeurs } from "./nutrition-base"

export type EntreeReference = { cle: string; alias: string[]; valeurs: Valeurs; densite?: number }

const v = (kcal: number, proteines: number, glucides: number, lipides: number, fibres: number): Valeurs => ({ kcal, proteines, glucides, lipides, fibres })

// Valeurs moyennes pour 100 g (ou 100 ml) de produit cru, indicatives.
export const REFERENCE: EntreeReference[] = [
  { cle: "riz", alias: ["riz"], valeurs: v(360, 7, 79, 0.6, 1.3) },
  { cle: "pates", alias: ["pates", "spaghetti", "macaroni"], valeurs: v(357, 12.5, 73, 1.5, 3) },
  { cle: "semoule", alias: ["semoule", "couscous"], valeurs: v(360, 12, 73, 1.1, 3) },
  { cle: "attieke", alias: ["attieke"], valeurs: v(140, 0.8, 34, 0.2, 1.5) },
  { cle: "igname", alias: ["igname"], valeurs: v(118, 1.5, 27.9, 0.2, 4.1) },
  { cle: "plantain", alias: ["banane plantain", "plantain", "alloco"], valeurs: v(122, 1.3, 31.9, 0.4, 2.3) },
  { cle: "banane", alias: ["banane", "banane douce"], valeurs: v(89, 1.1, 22.8, 0.3, 2.6) },
  { cle: "manioc", alias: ["manioc", "foufou", "placali"], valeurs: v(160, 1.4, 38, 0.3, 1.8) },
  { cle: "patate douce", alias: ["patate douce"], valeurs: v(86, 1.6, 20, 0.1, 3) },
  { cle: "pomme de terre", alias: ["pomme de terre"], valeurs: v(77, 2, 17, 0.1, 2.2) },
  { cle: "tomate", alias: ["tomate"], valeurs: v(18, 0.9, 3.9, 0.2, 1.2) },
  { cle: "concentre", alias: ["concentre de tomate", "puree de tomate"], valeurs: v(82, 4.3, 18, 0.5, 4) },
  { cle: "oignon", alias: ["oignon"], valeurs: v(40, 1.1, 9.3, 0.1, 1.7) },
  { cle: "ail", alias: ["ail"], valeurs: v(149, 6.4, 33, 0.5, 2.1) },
  { cle: "carotte", alias: ["carotte"], valeurs: v(41, 0.9, 9.6, 0.2, 2.8) },
  { cle: "chou", alias: ["chou"], valeurs: v(25, 1.3, 5.8, 0.1, 2.5) },
  { cle: "aubergine", alias: ["aubergine"], valeurs: v(25, 1, 6, 0.2, 3) },
  { cle: "gombo", alias: ["gombo"], valeurs: v(33, 1.9, 7.5, 0.2, 3.2) },
  { cle: "piment", alias: ["piment"], valeurs: v(40, 1.9, 8.8, 0.4, 1.5) },
  { cle: "epinard", alias: ["epinard", "epinards"], valeurs: v(23, 2.9, 3.6, 0.4, 2.2) },
  { cle: "salade", alias: ["salade", "laitue"], valeurs: v(15, 1.4, 2.2, 0.2, 1.3) },
  { cle: "poulet", alias: ["poulet", "volaille"], valeurs: v(121, 20.9, 0, 3.6, 0) },
  { cle: "boeuf", alias: ["boeuf", "viande de boeuf", "viande"], valeurs: v(200, 19, 0, 13, 0) },
  { cle: "poisson", alias: ["poisson", "tilapia", "capitaine", "thon", "sardine"], valeurs: v(96, 20, 0, 1.7, 0) },
  { cle: "oeuf", alias: ["oeuf", "oeufs"], valeurs: v(143, 12.6, 0.7, 9.5, 0) },
  { cle: "lait", alias: ["lait"], valeurs: v(64, 3.3, 4.8, 3.6, 0), densite: 1.03 },
  { cle: "yaourt", alias: ["yaourt"], valeurs: v(59, 3.5, 4.7, 3.3, 0) },
  { cle: "beurre", alias: ["beurre"], valeurs: v(717, 0.9, 0.1, 81, 0) },
  { cle: "huile palme", alias: ["huile de palme"], valeurs: v(884, 0, 0, 100, 0), densite: 0.91 },
  { cle: "huile", alias: ["huile"], valeurs: v(884, 0, 0, 100, 0), densite: 0.92 },
  { cle: "farine", alias: ["farine"], valeurs: v(364, 10, 76, 1, 2.7) },
  { cle: "pain", alias: ["pain"], valeurs: v(270, 9, 50, 3, 2.7) },
  { cle: "sucre", alias: ["sucre"], valeurs: v(400, 0, 100, 0, 0) },
  { cle: "sel", alias: ["sel"], valeurs: v(0, 0, 0, 0, 0) },
  { cle: "haricot", alias: ["haricot", "haricots", "niebe"], valeurs: v(336, 23.5, 60, 1.3, 10.6) },
  { cle: "arachide", alias: ["arachide", "arachides", "pate d arachide"], valeurs: v(588, 25, 20, 50, 8) },
  { cle: "mais", alias: ["mais"], valeurs: v(365, 9, 74, 4.7, 7.3) },
  { cle: "lentille", alias: ["lentille", "lentilles"], valeurs: v(352, 25, 60, 1.1, 11) },
  { cle: "gingembre", alias: ["gingembre"], valeurs: v(80, 1.8, 17.8, 0.8, 2) },
  { cle: "bouillon", alias: ["cube bouillon", "bouillon cube", "bouillon"], valeurs: v(210, 10, 12, 14, 0) },
  { cle: "orange", alias: ["orange"], valeurs: v(47, 0.9, 11.8, 0.1, 2.4) },
  { cle: "mangue", alias: ["mangue"], valeurs: v(60, 0.8, 15, 0.4, 1.6) },
  { cle: "papaye", alias: ["papaye"], valeurs: v(43, 0.5, 11, 0.3, 1.7) },
  { cle: "ananas", alias: ["ananas"], valeurs: v(50, 0.5, 13, 0.1, 1.4) },
]

export function normaliser(s: string): string {
  return s
    .replace(/\u0153/g, "oe")
    .replace(/\u00e6/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function referencePour(nom: string): EntreeReference | null {
  const n = " " + normaliser(nom) + " "
  let meilleur: EntreeReference | null = null
  let longueur = 0
  for (const e of REFERENCE) {
    for (const a of e.alias) {
      const na = normaliser(a)
      if (na.length > longueur && (n.includes(" " + na + " ") || n.includes(" " + na + "s "))) {
        meilleur = e
        longueur = na.length
      }
    }
  }
  return meilleur
}

export function densitePour(nom: string): number {
  return referencePour(nom)?.densite ?? 1
}