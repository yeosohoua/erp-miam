import { authentifierApi, json } from "@/lib/api-auth"
import { tableauKpis } from "@/lib/pilotage"

export async function GET(req: Request) {
  const a = await authentifierApi(req)
  if (a instanceof Response) return a
  const lignes = await tableauKpis(a.etabId)
  return json({ kpis: lignes.map((l) => ({ id: l.id, libelle: l.libelle, unite: l.unite, valeur: l.valeur, cible: l.cible, statut: l.statut })) })
}