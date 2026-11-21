import { erreur, json } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { SERVICES, ajouterJours, aujourdhui, dateValide, versDate, versIso, type ServiceMenu } from "@/lib/menus"
import { choisirFiche } from "@/lib/mobile-acces"
import { etablissementCatalogue } from "@/lib/mobile-catalogue"
import { authentifierMobile } from "@/lib/mobile-auth"
import { modeRepas } from "@/lib/mobile-commandes"

const urlImage = (id: string | null): string | null => (id ? "/api/mobile/v1/images/" + id : null)

// Menus publies de l'etablissement de l'inscrit (du ... au ..., 31 jours maximum), avec images.
export async function GET(req: Request) {
  const a = await authentifierMobile(req)
  if (a instanceof Response) return a
  const url = new URL(req.url)
  const du = url.searchParams.get("du") ?? aujourdhui()
  if (!dateValide(du)) return erreur(400, "Date de début invalide : format AAAA-MM-JJ attendu.")
  const au = url.searchParams.get("au") ?? ajouterJours(du, 7)
  if (!dateValide(au)) return erreur(400, "Date de fin invalide : format AAAA-MM-JJ attendu.")
  if (au < du) return erreur(400, "La date de fin précède la date de début.")
  if (au > ajouterJours(du, 31)) return erreur(400, "Période limitée à 31 jours.")
  let etablissementId: string
  let devise: string
  if (a.role === "PARENT" || a.role === "ELEVE") {
    const f = await choisirFiche(a, url.searchParams.get("inscritId"))
    if (f instanceof Response) return f
    etablissementId = f.etablissementId
    devise = f.etab.currency
  } else {
    const e = await etablissementCatalogue(a, req)
    if (e instanceof Response) return e
    etablissementId = e
    devise = (await db.etablissement.findUnique({ where: { id: e }, select: { currency: true } }))?.currency ?? "XOF"
  }
  const menus = await db.menu.findMany({
    where: { etablissementId, statut: "PUBLISHED", date: { gte: versDate(du), lte: versDate(au) } },
    orderBy: [{ date: "asc" }, { service: "asc" }],
    include: { plats: { include: { plat: { select: { id: true, name: true, description: true, imageId: true } } } } },
  })
  const tarifs = new Map((await db.tarif.findMany({ where: { etablissementId }, select: { service: true, prix: true } })).map((t) => [String(t.service), t.prix] as const))
  return json({
    mode: modeRepas(a),
    devise,
    du,
    au,
    menus: menus.map((m) => ({
      date: versIso(m.date),
      service: m.service,
      libelle: SERVICES[m.service as ServiceMenu] ?? String(m.service),
      prix: tarifs.get(String(m.service)) ?? null,
      image: urlImage(m.imageId),
      plats: m.plats.map((p) => ({ id: p.plat.id, nom: p.plat.name, description: p.plat.description, image: urlImage(p.plat.imageId) })).sort((x, y) => x.nom.localeCompare(y.nom, "fr")),
    })),
  })
}