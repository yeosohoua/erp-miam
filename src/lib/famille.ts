import "server-only"

import { db } from "@/lib/db"
import { requireSession } from "@/lib/guards"
import { FAMILLE_ACCES, hasRole } from "@/lib/permissions"
import type { SessionData } from "@/lib/session-token"

// Un parent est rattache a un enfant par l'adresse e-mail renseignee sur la fiche du tuteur (comparaison sans casse).
const lien = (email: string) => ({
  statut: { not: "LEFT" as const },
  etablissement: { active: true },
  tuteurs: { some: { email: { equals: email, mode: "insensitive" as const } } },
})
const inclure = {
  groupe: true,
  allergies: { include: { allergie: true } },
  etablissement: { select: { id: true, name: true, currency: true, prepaye: true, tarifs: { select: { service: true, prix: true } } } },
} as const

export async function accesFamille(): Promise<SessionData | null> {
  const session = await requireSession()
  return hasRole(session.role, FAMILLE_ACCES) ? session : null
}

export const enfantsDe = (email: string) => db.inscrit.findMany({ where: lien(email), include: inclure, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] })
export const enfantDe = (email: string, id: string) => db.inscrit.findFirst({ where: { ...lien(email), id }, include: inclure })