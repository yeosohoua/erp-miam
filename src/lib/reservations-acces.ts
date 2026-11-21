import "server-only"

import { contexteEtablissement, type EtabResume } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { RESERVATIONS_ECRITURE, RESERVATIONS_LECTURE, hasRole } from "@/lib/permissions"
import type { SessionData } from "@/lib/session-token"

export type AccesReservations = { session: SessionData; etab: EtabResume | null; ecriture: boolean }

// Lecture : roles du module. L'etablissement actif est toujours calcule cote serveur.
export async function accesReservations(): Promise<AccesReservations | null> {
  const session = await requireSession()
  if (!hasRole(session.role, RESERVATIONS_LECTURE)) return null
  const { courant } = await contexteEtablissement()
  return { session, etab: courant, ecriture: hasRole(session.role, RESERVATIONS_ECRITURE) }
}

export async function accesReservationsEcriture(): Promise<{ erreur: string } | { session: SessionData; etabId: string }> {
  const a = await accesReservations()
  if (!a || !a.ecriture) return { erreur: "Action non autorisée pour votre rôle." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}