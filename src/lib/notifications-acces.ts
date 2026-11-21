import "server-only"

import { contexteEtablissement, type EtabResume } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { NOTIFICATIONS_ECRITURE, PARAMETRES_LECTURE, hasRole } from "@/lib/permissions"
import type { SessionData } from "@/lib/session-token"

export type AccesNotifications = { session: SessionData; etab: EtabResume | null }

export async function accesNotifications(): Promise<AccesNotifications | null> {
  const session = await requireSession()
  if (!hasRole(session.role, PARAMETRES_LECTURE)) return null
  const { courant } = await contexteEtablissement()
  return { session, etab: courant }
}

export async function accesNotificationsEcriture(): Promise<{ erreur: string } | { session: SessionData; etabId: string }> {
  const session = await requireSession()
  if (!hasRole(session.role, NOTIFICATIONS_ECRITURE)) return { erreur: "Action réservée aux responsables." }
  const { courant } = await contexteEtablissement()
  if (!courant) return { erreur: "Aucun établissement actif." }
  return { session, etabId: courant.id }
}