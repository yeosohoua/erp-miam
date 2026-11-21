import "server-only"

import { cookies } from "next/headers"
import { cache } from "react"

import { db } from "@/lib/db"
import { COOKIE_NAME, SESSION_DURATION_SECONDS, decrypt, encrypt, type SessionData } from "@/lib/session-token"

export type { SessionData }

export async function createSession(data: SessionData): Promise<void> {
  const token = await encrypt(data)
  const store = await cookies()
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  })
}

export async function deleteSession(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}

// Le role et l'etat du compte viennent toujours de la base : un compte desactive ou un jeton perime est refuse aussitot.
export const getSession = cache(async (): Promise<SessionData | null> => {
  const store = await cookies()
  const data = await decrypt(store.get(COOKIE_NAME)?.value)
  if (!data) return null
  const utilisateur = await db.user.findUnique({
    where: { id: data.userId },
    select: { active: true, tokenVersion: true, role: true, name: true, email: true },
  })
  if (!utilisateur || !utilisateur.active || utilisateur.tokenVersion !== data.tv) return null
  return {
    userId: data.userId,
    role: String(utilisateur.role),
    name: utilisateur.name,
    email: utilisateur.email,
    tv: utilisateur.tokenVersion,
  }
})