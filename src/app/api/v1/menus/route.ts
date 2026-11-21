import { authentifierApi, erreur, json } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { ajouterJours, aujourdhui, dateValide, versDate } from "@/lib/menus"

// Menus publies uniquement, du ... au ... (31 jours maximum, defaut : aujourd'hui + 7 jours).
export async function GET(req: Request) {
  const a = await authentifierApi(req)
  if (a instanceof Response) return a
  const url = new URL(req.url)
  const du = url.searchParams.get("du") ?? aujourdhui()
  if (!dateValide(du)) return erreur(400, "Date de début invalide : format AAAA-MM-JJ attendu.")
  const auBrut = url.searchParams.get("au")
  const au = auBrut ?? ajouterJours(du, 7)
  if (!dateValide(au)) return erreur(400, "Date de fin invalide : format AAAA-MM-JJ attendu.")
  if (au < du) return erreur(400, "La date de fin précède la date de début.")
  if (au > ajouterJours(du, 31)) return erreur(400, "Période limitée à 31 jours.")
  const menus = await db.menu.findMany({
    where: { etablissementId: a.etabId, statut: "PUBLISHED", date: { gte: versDate(du), lte: versDate(au) } },
    orderBy: [{ date: "asc" }, { service: "asc" }],
    include: { plats: { include: { plat: { select: { name: true } } } } },
  })
  return json({ du, au, menus: menus.map((m) => ({ date: m.date.toISOString().slice(0, 10), service: m.service, plats: m.plats.map((p) => p.plat.name).sort() })) })
}