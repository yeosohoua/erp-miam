import "server-only"

import { contexteEtablissement, type EtabResume } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { API_ADMIN, PILOTAGE_ADMIN, PILOTAGE_LECTURE, hasRole } from "@/lib/permissions"
import type { SessionData } from "@/lib/session-token"

export type AccesPilotage = { session: SessionData; etab: EtabResume | null; admin: boolean; api: boolean }

export async function accesPilotage(): Promise<AccesPilotage | null> {
  const session = await requireSession()
  if (!hasRole(session.role, PILOTAGE_LECTURE)) return null
  const { courant } = await contexteEtablissement()
  return { session, etab: courant, admin: hasRole(session.role, PILOTAGE_ADMIN), api: hasRole(session.role, API_ADMIN) }
}

export async function accesPilotageAdmin(): Promise<{ erreur: string } | { session: SessionData; etabId: string }> {
  const a = await accesPilotage()
  if (!a || !a.admin) return { erreur: "Cette action est réservée à l'administrateur et au gestionnaire." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}

export async function accesApiAdmin(): Promise<{ erreur: string } | { session: SessionData; etabId: string }> {
  const a = await accesPilotage()
  if (!a || !a.api) return { erreur: "La gestion des clés d'API est réservée à l'administrateur." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}