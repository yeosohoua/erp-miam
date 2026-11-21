import { db } from "@/lib/db"
import { etablissementsAccessibles } from "@/lib/etablissement"
import { getSession } from "@/lib/session"

// Les images sont servies aux seuls utilisateurs connectes, et celles d'un etablissement a ses seuls membres.
// L'identifiant change a chaque import : la reponse peut etre mise en cache longtemps par le navigateur.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return new Response("Non autorisé", { status: 401 })
  const { id } = await ctx.params
  if (!/^[a-z0-9]{10,40}$/.test(id)) return new Response("Introuvable", { status: 404 })
  const img = await db.image.findUnique({ where: { id } })
  if (!img) return new Response("Introuvable", { status: 404 })
  if (img.etablissementId) {
    const liste = await etablissementsAccessibles(session.userId, session.role)
    if (!liste.some((e) => e.id === img.etablissementId)) {
      const parent = await db.inscrit.findFirst({ where: { imageId: id, tuteurs: { some: { email: { equals: session.email, mode: "insensitive" } } } }, select: { id: true } })
      if (!parent) return new Response("Introuvable", { status: 404 })
    }
  }
  const corps = new Uint8Array(img.donnees)
  return new Response(corps, {
    headers: {
      "Content-Type": img.mime,
      "Content-Length": String(corps.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  })
}