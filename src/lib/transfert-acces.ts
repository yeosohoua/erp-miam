import "server-only"

import { contexteEtablissement, type EtabResume } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { CUISINE_CENTRALE, hasRole } from "@/lib/permissions"
import type { SessionData } from "@/lib/session-token"

export type AccesTransferts = { session: SessionData; etab: EtabResume | null }

export async function accesTransferts(): Promise<AccesTransferts | null> {
  const session = await requireSession()
  if (!hasRole(session.role, CUISINE_CENTRALE)) return null
  const { courant } = await contexteEtablissement()
  return { session, etab: courant }
}