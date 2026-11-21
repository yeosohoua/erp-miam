import { json } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { SERVICES, ajouterJours, aujourdhui, versDate, versIso, type ServiceMenu } from "@/lib/menus"
import { etablissementCatalogue, urlImage } from "@/lib/mobile-catalogue"
import { authentifierMobile } from "@/lib/mobile-auth"

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"]

// Menus publies de lundi a vendredi : semaine en cours, ou la suivante le samedi et le dimanche.
export async function GET(req: Request) {
  const a = await authentifierMobile(req)
  if (a instanceof Response) return a
  const etab = await etablissementCatalogue(a, req)
  if (etab instanceof Response) return etab
  const auj = aujourdhui()
  const dow = new Date(auj + "T00:00:00Z").getUTCDay()
  const lundi = dow === 6 ? ajouterJours(auj, 2) : dow === 0 ? ajouterJours(auj, 1) : ajouterJours(auj, -(dow - 1))
  const vendredi = ajouterJours(lundi, 4)
  const menus = await db.menu.findMany({
    where: { etablissementId: etab, statut: "PUBLISHED", date: { gte: versDate(lundi), lte: versDate(vendredi) } },
    orderBy: [{ date: "asc" }, { service: "asc" }],
    include: { plats: { include: { plat: { select: { name: true, imageId: true } } } } },
  })
  const jours = JOURS.map((libelle, i) => {
    const date = ajouterJours(lundi, i)
    const du_jour = menus.filter((m) => versIso(m.date) === date)
    const image = du_jour.map((m) => m.imageId).find((x) => !!x) ?? du_jour.flatMap((m) => m.plats.map((p) => p.plat.imageId)).find((x) => !!x) ?? null
    return {
      jour: libelle,
      date,
      image: urlImage(image),
      menus: du_jour.map((m) => ({
        service: m.service,
        libelle: SERVICES[m.service as ServiceMenu] ?? String(m.service),
        plats: m.plats.map((p) => p.plat.name).sort((x, y) => x.localeCompare(y, "fr")),
      })),
    }
  })
  return json({ du: lundi, au: vendredi, jours })
}