import { json } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { etablissementCatalogue, urlImage } from "@/lib/mobile-catalogue"
import { authentifierMobile } from "@/lib/mobile-auth"

// Categories d'articles actives de l'etablissement, avec le nombre d'articles actifs.
export async function GET(req: Request) {
  const a = await authentifierMobile(req)
  if (a instanceof Response) return a
  const etab = await etablissementCatalogue(a, req)
  if (etab instanceof Response) return etab
  const [categories, articles] = await Promise.all([
    db.categorieArticle.findMany({ where: { etablissementId: etab, active: true }, orderBy: [{ ordre: "asc" }, { nom: "asc" }] }),
    db.articleCarte.findMany({ where: { etablissementId: etab, active: true, categorie: { not: null } }, select: { categorie: true } }),
  ])
  const compte = new Map<string, number>()
  for (const x of articles) if (x.categorie) compte.set(x.categorie, (compte.get(x.categorie) ?? 0) + 1)
  return json({ categories: categories.map((c) => ({ id: c.id, nom: c.nom, articles: compte.get(c.nom) ?? 0, image: urlImage(c.imageId) })) })
}