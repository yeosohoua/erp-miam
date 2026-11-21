export const SOURCES_AVIS = ["ELEVE", "PARENT", "PERSONNEL", "COMPTOIR"] as const
export type SourceAvisCle = (typeof SOURCES_AVIS)[number]
export const LIBELLES_SOURCE: Record<SourceAvisCle, string> = { ELEVE: "Élève", PARENT: "Parent", PERSONNEL: "Personnel", COMPTOIR: "Comptoir" }

export const STATUTS_SUGGESTION = ["NOUVELLE", "EN_COURS", "TRAITEE", "REJETEE"] as const
export type StatutSuggestionCle = (typeof STATUTS_SUGGESTION)[number]
export const LIBELLES_STATUT_SUGGESTION: Record<StatutSuggestionCle, string> = { NOUVELLE: "Nouvelle", EN_COURS: "En cours", TRAITEE: "Traitée", REJETEE: "Rejetée" }

export const noteValide = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 5

export type StatsAvis = { nombre: number; moyenne10: number; satisfaits: number }

// Moyenne en dixiemes (33 = 3,3) pour eviter les flottants ; satisfaits = part des notes de 4 et 5, en pourcentage.
export function statsAvis(notes: number[]): StatsAvis {
  const n = notes.length
  if (n === 0) return { nombre: 0, moyenne10: 0, satisfaits: 0 }
  const somme = notes.reduce((s, x) => s + x, 0)
  return { nombre: n, moyenne10: Math.round((somme * 10) / n), satisfaits: Math.round((notes.filter((x) => x >= 4).length * 100) / n) }
}

export const formaterMoyenne = (moyenne10: number): string => (moyenne10 / 10).toFixed(1).replace(".", ",")

export type PlatNote = { plat: string; nombre: number; moyenne10: number }

export function notesParPlat(avis: { platNom: string | null; note: number }[]): PlatNote[] {
  const groupes = new Map<string, number[]>()
  for (const a of avis) {
    if (!a.platNom) continue
    groupes.set(a.platNom, [...(groupes.get(a.platNom) ?? []), a.note])
  }
  return [...groupes.entries()]
    .map(([plat, notes]) => ({ plat, nombre: notes.length, moyenne10: statsAvis(notes).moyenne10 }))
    .sort((a, b) => b.moyenne10 - a.moyenne10 || b.nombre - a.nombre || a.plat.localeCompare(b.plat))
}

// Un avis de parent porte "Parent de Prenom Nom" : ce nom sert aussi a empecher de noter deux fois le meme repas.
export const auteurParent = (prenom: string, nom: string): string => ("Parent de " + prenom + " " + nom).slice(0, 60)