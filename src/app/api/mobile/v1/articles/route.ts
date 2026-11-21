import { json } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { etablissementCatalogue, urlImage } from "@/lib/mobile-catalogue"
import { authentifierMobile } from "@/lib/mobile-auth"

// Articles actifs de la caisse (carte), filtrables par categorie (?categorie=Nom), 100 maximum.
export async function GET(req: Request) {
  const a = await authentifierMobile(req)
  if (a instanceof Response) return a
  const etab = await etablissementCatalogue(a, req)
  if (etab instanceof Response) return etab
  const categorie = new URL(req.url).searchParams.get("categorie")
  const articles = await db.articleCarte.findMany({
    where: { etablissementId: etab, active: true, ...(categorie ? { categorie } : {}) },
    orderBy: [{ categorie: "asc" }, { nom: "asc" }],
    take: 100,
    select: { id: true, nom: true, prix: true, categorie: true, imageId: true },
  })
  return json({ articles: articles.map((x) => ({ id: x.id, nom: x.nom, prix: x.prix, categorie: x.categorie, image: urlImage(x.imageId) })) })
}