import { authentifierApi, erreur, json } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { ajouterJours, aujourdhui, versDate } from "@/lib/menus"

// Repas servis par jour et par service (effectifs agreges, aucune donnee personnelle).
export async function GET(req: Request) {
  const a = await authentifierApi(req)
  if (a instanceof Response) return a
  const brut = new URL(req.url).searchParams.get("jours") ?? "30"
  if (!/^\d{1,2}$/.test(brut) || Number(brut) < 1 || Number(brut) > 90) return erreur(400, "Paramètre jours invalide : de 1 à 90.")
  const jours = Number(brut)
  const debut = ajouterJours(aujourdhui(), -(jours - 1))
  const consos = await db.consommation.findMany({ where: { etablissementId: a.etabId, date: { gte: versDate(debut) } }, orderBy: [{ date: "asc" }, { service: "asc" }], select: { date: true, service: true, repas: true } })
  return json({ du: debut, au: aujourdhui(), frequentation: consos.map((c) => ({ date: c.date.toISOString().slice(0, 10), service: c.service, repas: c.repas })) })
}