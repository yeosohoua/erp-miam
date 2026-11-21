"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"

import { COOKIE_ETAB, etablissementsAccessibles } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"

export async function choisirEtablissement(id: string): Promise<void> {
  const session = await requireSession()
  const liste = await etablissementsAccessibles(session.userId, session.role)
  if (!liste.some((e) => e.id === id)) return
  const store = await cookies()
  store.set(COOKIE_ETAB, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
  revalidatePath("/", "layout")
}