import "server-only"

import { createHash } from "node:crypto"

import { jwtVerify, SignJWT } from "jose"

import { erreur } from "@/lib/api-auth"
import { db } from "@/lib/db"

export const DUREE_JETON_MOBILE = 60 * 60 * 24 * 30

export type AuthMobile = { userId: string; role: string; name: string; email: string; etabIds: string[] }

// Cle derivee et distincte de celle du cookie web : un jeton mobile n'ouvre jamais une session web.
function cle(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET manquant ou trop court (32 caracteres minimum)")
  return new Uint8Array(createHash("sha256").update(secret + ":miam-mobile-v1").digest())
}

export async function signerJetonMobile(userId: string, tv: number): Promise<string> {
  return new SignJWT({ tv, typ: "mobile" }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(DUREE_JETON_MOBILE + "s").sign(cle())
}

// Le compte est relu en base a chaque appel : compte desactive ou tokenVersion change = jeton refuse.
export async function authentifierMobile(req: Request): Promise<AuthMobile | Response> {
  const entete = req.headers.get("authorization") ?? ""
  const jeton = entete.startsWith("Bearer ") ? entete.slice(7).trim() : ""
  if (!jeton) return erreur(401, "Connexion requise.")
  let sujet = ""
  let tv = -1
  try {
    const { payload } = await jwtVerify(jeton, cle(), { algorithms: ["HS256"] })
    if (payload.typ !== "mobile" || typeof payload.sub !== "string" || typeof payload.tv !== "number") return erreur(401, "Session invalide.")
    sujet = payload.sub
    tv = payload.tv
  } catch {
    return erreur(401, "Session expirée. Reconnectez-vous.")
  }
  const u = await db.user.findUnique({
    where: { id: sujet },
    select: { id: true, active: true, tokenVersion: true, role: true, name: true, email: true, etablissements: { select: { etablissementId: true } } },
  })
  if (!u || !u.active || u.tokenVersion !== tv) return erreur(401, "Session expirée. Reconnectez-vous.")
  return { userId: u.id, role: String(u.role), name: u.name, email: u.email, etabIds: u.etablissements.map((e) => e.etablissementId) }
}