import "server-only"

import { db } from "@/lib/db"
import { prefixeEtab, suivantMatricule } from "@/lib/inscrits-matricule-calcul"

// Prochain matricule libre de l'etablissement, au format annee + prefixe etablissement + 4 chiffres.
export async function prochainMatricule(etabId: string, _type?: string): Promise<string> {
  void _type
  const etab = await db.etablissement.findUnique({ where: { id: etabId }, select: { code: true } })
  const annee = Number(new Intl.DateTimeFormat("fr-FR", { year: "numeric", timeZone: "Africa/Abidjan" }).format(new Date()))
  const prefixe = prefixeEtab(etab?.code ?? "")
  const base = String(annee % 100).padStart(2, "0") + (prefixe || "E")
  const existants = await db.inscrit.findMany({ where: { etablissementId: etabId, matricule: { startsWith: base } }, select: { matricule: true } })
  return suivantMatricule(existants.map((e) => e.matricule), annee, prefixe)
}