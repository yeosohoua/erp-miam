import "server-only"

import { contexteEtablissement, type EtabResume } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { CONGES_ECRITURE, CONGES_LECTURE, hasRole } from "@/lib/permissions"
import type { SessionData } from "@/lib/session-token"

export type AccesPersonnel = { session: SessionData; etab: EtabResume | null; ecriture: boolean }

export async function accesPersonnel(): Promise<AccesPersonnel | null> {
  const session = await requireSession()
  if (!hasRole(session.role, CONGES_LECTURE)) return null
  const { courant } = await contexteEtablissement()
  return { session, etab: courant, ecriture: hasRole(session.role, CONGES_ECRITURE) }
}

export async function accesPersonnelEcriture(): Promise<{ erreur: string } | { session: SessionData; etabId: string }> {
  const a = await accesPersonnel()
  if (!a || !a.ecriture) return { erreur: "Action non autorisée pour votre rôle." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}