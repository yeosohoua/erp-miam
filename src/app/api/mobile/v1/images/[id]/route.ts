import { erreur } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { authentifierMobile } from "@/lib/mobile-auth"

// Image d'un plat ou d'un menu, reservee aux membres de l'etablissement qui la possede.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await authentifierMobile(req)
  if (a instanceof Response) return a
  const { id } = await params
  const img = await db.image.findUnique({ where: { id }, select: { mime: true, donnees: true, etablissementId: true } })
  if (!img || !img.etablissementId || !a.etabIds.includes(img.etablissementId)) return erreur(404, "Image introuvable.")
  const copie = new Uint8Array(img.donnees.byteLength)
  copie.set(img.donnees)
  return new Response(copie, { headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } })
}