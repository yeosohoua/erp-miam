import "server-only"

import { contexteEtablissement, type EtabResume } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { REAPPRO_ECRITURE, REAPPRO_LECTURE, hasRole } from "@/lib/permissions"
import type { SessionData } from "@/lib/session-token"

export type AccesReappro = { session: SessionData; etab: EtabResume | null; ecriture: boolean }

export async function accesReappro(): Promise<AccesReappro | null> {
  const session = await requireSession()
  if (!hasRole(session.role, REAPPRO_LECTURE)) return null
  const { courant } = await contexteEtablissement()
  return { session, etab: courant, ecriture: hasRole(session.role, REAPPRO_ECRITURE) }
}

export async function accesReapproEcriture(): Promise<{ erreur: string } | { session: SessionData; etabId: string }> {
  const a = await accesReappro()
  if (!a || !a.ecriture) return { erreur: "Action réservée à l'achat, au gestionnaire et à l'administrateur." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}