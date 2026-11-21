import "server-only"

import { analyserCle, verifierCle } from "@/lib/api-cle"
import { db } from "@/lib/db"
import { redis } from "@/lib/redis"

export const json = (data: unknown, status = 200): Response => Response.json(data, { status, headers: { "Cache-Control": "no-store" } })
export const erreur = (status: number, message: string): Response => json({ error: message }, status)

export type AuthApi = { etabId: string; cleId: string }

// Authentifie un appel par "Authorization: Bearer miam_...". Renvoie l'etablissement de la cle, ou la reponse d'erreur a retourner.
export async function authentifierApi(req: Request): Promise<AuthApi | Response> {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")
  if (!m) return erreur(401, "Clé d'API manquante.")
  const analyse = analyserCle(m[1])
  if (!analyse) return erreur(401, "Clé d'API invalide.")
  const cle = await db.cleApi.findUnique({ where: { prefixe: analyse.prefixe }, include: { etablissement: { select: { active: true } } } })
  if (!cle || !cle.actif || cle.revoqueeLe || !cle.etablissement.active || !verifierCle(m[1], cle.hash)) return erreur(401, "Clé d'API invalide.")
  const limite = Number(process.env.API_LIMITE_MINUTE ?? "60") || 60
  try {
    const k = "rl:api:" + cle.id + ":" + Math.floor(Date.now() / 60000)
    const n = await redis().incr(k)
    if (n === 1) await redis().expire(k, 70)
    if (n > limite) {
      return new Response(JSON.stringify({ error: "Trop de requêtes, réessayez dans un instant." }), {
        status: 429,
        headers: { "content-type": "application/json", "Retry-After": String(60 - Math.floor((Date.now() / 1000) % 60)), "Cache-Control": "no-store" },
      })
    }
  } catch {
    // Redis indisponible : l'appel authentifie reste servi.
  }
  if (!cle.derniereUtilisation || Date.now() - cle.derniereUtilisation.getTime() > 60000) {
    await db.cleApi.update({ where: { id: cle.id }, data: { derniereUtilisation: new Date() } })
  }
  return { etabId: cle.etablissementId, cleId: cle.id }
}