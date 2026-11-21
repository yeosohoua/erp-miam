import "server-only"

import { contexteEtablissement, type EtabResume } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { HACCP_ADMIN, HACCP_ECRITURE, HACCP_LECTURE, hasRole } from "@/lib/permissions"
import type { SessionData } from "@/lib/session-token"

export type AccesHaccp = { session: SessionData; etab: EtabResume | null; ecriture: boolean; admin: boolean }

export async function accesHaccp(): Promise<AccesHaccp | null> {
  const session = await requireSession()
  if (!hasRole(session.role, HACCP_LECTURE)) return null
  const { courant } = await contexteEtablissement()
  return { session, etab: courant, ecriture: hasRole(session.role, HACCP_ECRITURE), admin: hasRole(session.role, HACCP_ADMIN) }
}

export async function accesHaccpEcriture(): Promise<{ erreur: string } | { session: SessionData; etabId: string }> {
  const a = await accesHaccp()
  if (!a || !a.ecriture) return { erreur: "Action non autorisée pour votre rôle." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}

export async function accesHaccpAdmin(): Promise<{ erreur: string } | { session: SessionData; etabId: string }> {
  const a = await accesHaccp()
  if (!a || !a.admin) return { erreur: "Cette action est réservée à l'administrateur et au gestionnaire." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}