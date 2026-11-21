export const TYPES_INSCRIT = { STUDENT: "Élève", EMPLOYEE: "Employé", GUEST: "Invité" } as const
export type TypeInscrit = keyof typeof TYPES_INSCRIT

export const STATUTS_INSCRIT = { ACTIVE: "Actif", SUSPENDED: "Suspendu", LEFT: "Sorti" } as const
export type StatutInscrit = keyof typeof STATUTS_INSCRIT

export const KINDS = { GROUPE: "Groupes (classes, équipes)", REGIME: "Régimes alimentaires", ALLERGIE: "Allergies" } as const
export type KindRef = keyof typeof KINDS

export const typeInscritValide = (v: string): v is TypeInscrit => Object.hasOwn(TYPES_INSCRIT, v)
export const statutInscritValide = (v: string): v is StatutInscrit => Object.hasOwn(STATUTS_INSCRIT, v)
export const kindValide = (v: string): v is KindRef => Object.hasOwn(KINDS, v)
export const matriculeValide = (v: string): boolean => /^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/.test(v)
export const telephoneValide = (v: string): boolean => v.length <= 30 && /^[0-9+().\s-]*$/.test(v)

const sansAccent = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()

function typeDepuisTexte(v: string): TypeInscrit | null {
  const n = sansAccent(v)
  if (n === "" || n === "eleve" || n === "student") return "STUDENT"
  if (n === "employe" || n === "employee") return "EMPLOYEE"
  if (n === "invite" || n === "guest") return "GUEST"
  return null
}

export type LigneImport = { matricule: string; prenom: string; nom: string; type: TypeInscrit; groupe: string; regime: string }

// Format : en-tete obligatoire, separateur ; ou , (pas de guillemets). Colonnes : matricule, prenom, nom, type, groupe, regime.
export function analyserCsv(texte: string): { erreur: string } | { lignes: LigneImport[] } {
  const brutes = texte.split(/\r?\n/).filter((l) => l.trim() !== "")
  if (brutes.length < 2) return { erreur: "Le fichier doit contenir une ligne d'en-tête et au moins un inscrit." }
  if (brutes.length - 1 > 500) return { erreur: "Maximum 500 inscrits par import." }
  const sep = brutes[0].includes(";") ? ";" : ","
  const entetes = brutes[0].split(sep).map(sansAccent)
  const col = (nom: string) => entetes.indexOf(nom)
  for (const requis of ["matricule", "prenom", "nom"]) {
    if (col(requis) < 0) return { erreur: "Colonne manquante dans l'en-tête : " + requis + "." }
  }
  const lignes: LigneImport[] = []
  const vus = new Set<string>()
  for (let i = 1; i < brutes.length; i++) {
    const c = brutes[i].split(sep).map((x) => x.trim())
    const val = (nom: string) => (col(nom) >= 0 ? (c[col(nom)] ?? "") : "")
    const n = i + 1
    const matricule = val("matricule")
    if (!matriculeValide(matricule)) return { erreur: "Ligne " + n + " : matricule invalide." }
    if (vus.has(matricule)) return { erreur: "Ligne " + n + " : matricule en double dans le fichier (" + matricule + ")." }
    vus.add(matricule)
    const prenom = val("prenom")
    const nom = val("nom")
    if (prenom.length < 1 || prenom.length > 60 || nom.length < 1 || nom.length > 60) return { erreur: "Ligne " + n + " : prénom ou nom invalide." }
    const type = typeDepuisTexte(val("type"))
    if (!type) return { erreur: "Ligne " + n + " : type inconnu « " + val("type") + " »." }
    const groupe = val("groupe")
    const regime = val("regime")
    if (groupe.length > 60 || regime.length > 60) return { erreur: "Ligne " + n + " : groupe ou régime trop long." }
    lignes.push({ matricule, prenom, nom, type, groupe, regime })
  }
  return { lignes }
}