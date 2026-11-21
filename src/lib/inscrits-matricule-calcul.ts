// Matricule : annee sur 2 chiffres + prefixe de l'etablissement + 4 chiffres (ex. 26GSL0079).
export const prefixeEtab = (code: string): string =>
  (code.split("-")[0] ?? "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 6)

export function suivantMatricule(existants: string[], annee: number, prefixe: string): string {
  const base = String(annee % 100).padStart(2, "0") + (prefixe || "E")
  let max = 0
  for (const m of existants) {
    if (!m.startsWith(base)) continue
    const reste = m.slice(base.length)
    if (/^\d{4}$/.test(reste)) max = Math.max(max, Number(reste))
  }
  return base + String(Math.min(max + 1, 9999)).padStart(4, "0")
}