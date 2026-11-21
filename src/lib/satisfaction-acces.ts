import "server-only"

import { contexteEtablissement, type EtabResume } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { SATISFACTION_LECTURE, SATISFACTION_SAISIE, SATISFACTION_TRAITEMENT, hasRole } from "@/lib/permissions"
import type { SessionData } from "@/lib/session-token"

export type AccesSatisfaction = { session: SessionData; etab: EtabResume | null; saisie: boolean; traitement: boolean }

export async function accesSatisfaction(): Promise<AccesSatisfaction | null> {
  const session = await requireSession()
  if (!hasRole(session.role, SATISFACTION_LECTURE)) return null
  const { courant } = await contexteEtablissement()
  return { session, etab: courant, saisie: hasRole(session.role, SATISFACTION_SAISIE), traitement: hasRole(session.role, SATISFACTION_TRAITEMENT) }
}

export async function accesSatisfactionSaisie(): Promise<{ erreur: string } | { session: SessionData; etabId: string }> {
  const a = await accesSatisfaction()
  if (!a || !a.saisie) return { erreur: "Action non autorisée pour votre rôle." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}

export async function accesSatisfactionTraitement(): Promise<{ erreur: string } | { session: SessionData; etabId: string }> {
  const a = await accesSatisfaction()
  if (!a || !a.traitement) return { erreur: "Cette action est réservée à l'administrateur et au gestionnaire." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}