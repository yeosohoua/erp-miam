import "server-only"

import { jwtVerify, SignJWT } from "jose"
import { cookies } from "next/headers"

const COOKIE = "miam_2fa"
const DUREE_SECONDES = 5 * 60

function cle(): Uint8Array {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error("SESSION_SECRET manquant ou trop court")
  return new TextEncoder().encode("defi-2fa:" + s)
}

// Defi a duree courte : prouve que le mot de passe est valide, sans ouvrir de session.
export async function creerDefi(userId: string, tv: number): Promise<void> {
  const jeton = await new SignJWT({ userId, tv, p: "2fa" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(DUREE_SECONDES + "s").sign(cle())
  const store = await cookies()
  store.set(COOKIE, jeton, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: DUREE_SECONDES })
}

export async function lireDefi(): Promise<{ userId: string; tv: number } | null> {
  const valeur = (await cookies()).get(COOKIE)?.value
  if (!valeur) return null
  try {
    const { payload } = await jwtVerify(valeur, cle(), { algorithms: ["HS256"] })
    if (payload.p !== "2fa" || typeof payload.userId !== "string" || typeof payload.tv !== "number") return null
    return { userId: payload.userId, tv: payload.tv }
  } catch {
    return null
  }
}

export async function effacerDefi(): Promise<void> {
  ;(await cookies()).delete(COOKIE)
}