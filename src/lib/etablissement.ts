import "server-only"

import { cookies } from "next/headers"
import { cache } from "react"

import { db } from "@/lib/db"
import { getSession } from "@/lib/session"

export const COOKIE_ETAB = "miam_etab"

export type EtabResume = { id: string; code: string; name: string; type: string }

// L'administrateur voit tous les etablissements actifs ; les autres roles, seulement ceux auxquels ils sont affectes.
export async function etablissementsAccessibles(userId: string, role: string): Promise<EtabResume[]> {
  return db.etablissement.findMany({
    where: role === "ADMIN" ? { active: true } : { active: true, users: { some: { userId } } },
    select: { id: true, code: true, name: true, type: true },
    orderBy: { name: "asc" },
  })
}

// Etablissement actif : le cookie n'est qu'une preference, il est toujours revalide contre les droits reels.
export const contexteEtablissement = cache(async (): Promise<{ courant: EtabResume | null; liste: EtabResume[] }> => {
  const session = await getSession()
  if (!session) return { courant: null, liste: [] }
  const liste = await etablissementsAccessibles(session.userId, session.role)
  const demande = (await cookies()).get(COOKIE_ETAB)?.value
  return { courant: liste.find((e) => e.id === demande) ?? liste[0] ?? null, liste }
})