import "server-only"

import { contexteEtablissement, type EtabResume } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { FACTURATION_ECRITURE, FACTURATION_LECTURE, hasRole } from "@/lib/permissions"
import type { SessionData } from "@/lib/session-token"

export type AccesFacturation = { session: SessionData; etab: EtabResume | null; ecriture: boolean }

export async function accesFacturation(): Promise<AccesFacturation | null> {
  const session = await requireSession()
  if (!hasRole(session.role, FACTURATION_LECTURE)) return null
  const { courant } = await contexteEtablissement()
  return { session, etab: courant, ecriture: hasRole(session.role, FACTURATION_ECRITURE) }
}

export async function accesFacturationEcriture(): Promise<{ erreur: string } | { session: SessionData; etabId: string }> {
  const a = await accesFacturation()
  if (!a || !a.ecriture) return { erreur: "Action non autorisée pour votre rôle." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}