export function validerMotDePasse(motDePasse: string): string | null {
  if (motDePasse.length < 10) return "Le mot de passe doit comporter au moins 10 caractères."
  if (motDePasse.length > 72) return "Le mot de passe doit comporter au plus 72 caractères."
  if (!/[A-Za-z]/.test(motDePasse) || !/[0-9]/.test(motDePasse)) {
    return "Le mot de passe doit contenir au moins une lettre et un chiffre."
  }
  return null
}