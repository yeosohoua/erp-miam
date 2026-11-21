// Code d'acces : 5 caracteres parmi 32 (sans I, O, 0, 1 pour eviter les confusions a la lecture).
export const ALPHABET_CODE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
export const LONGUEUR_CODE = 5

// Qui peut se connecter avec un code. Retirer "PARENT" pour garder les parents sur e-mail + mot de passe.
export const CIBLES_CONNEXION_CODE = ["INSCRIT", "EMPLOYE", "PARENT"] as const

export const normaliserCode = (saisie: string): string => saisie.toUpperCase().replace(/[\s-]/g, "")
export const codeValide = (code: string): boolean => /^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{5}$/.test(code)