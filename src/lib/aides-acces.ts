import "server-only"

import { contexteEtablissement, type EtabResume } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { AIDES_ECRITURE, AIDES_LECTURE, hasRole } from "@/lib/permissions"
import type { SessionData } from "@/lib/session-token"

export type AccesAides = { session: SessionData; etab: EtabResume | null; ecriture: boolean }
type Autorisation = { erreur: string } | { session: SessionData; etabId: string }

export async function accesAides(): Promise<AccesAides | null> {
  const session = await requireSession()
  if (!hasRole(session.role, AIDES_LECTURE)) return null
  const { courant } = await contexteEtablissement()
  return { session, etab: courant, ecriture: hasRole(session.role, AIDES_ECRITURE) }
}

export async function accesAidesEcriture(): Promise<Autorisation> {
  const a = await accesAides()
  if (!a || !a.ecriture) return { erreur: "Les aides sociales sont réservées au gestionnaire et à l'administrateur." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}