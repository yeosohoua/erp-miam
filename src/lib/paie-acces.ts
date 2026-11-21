import "server-only"

import { contexteEtablissement, type EtabResume } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { PAIE_LECTURE, PAIE_VALIDATION, RH_ECRITURE, hasRole } from "@/lib/permissions"
import type { SessionData } from "@/lib/session-token"

export type AccesPaie = { session: SessionData; etab: EtabResume | null; ecriture: boolean; validation: boolean }

export async function accesPaie(): Promise<AccesPaie | null> {
  const session = await requireSession()
  if (!hasRole(session.role, PAIE_LECTURE)) return null
  const { courant } = await contexteEtablissement()
  return { session, etab: courant, ecriture: hasRole(session.role, RH_ECRITURE), validation: hasRole(session.role, PAIE_VALIDATION) }
}

export async function accesPaieEcriture(): Promise<{ erreur: string } | { session: SessionData; etabId: string }> {
  const a = await accesPaie()
  if (!a || !a.ecriture) return { erreur: "Action non autorisée pour votre rôle." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}

export async function accesPaieValidation(): Promise<{ erreur: string } | { session: SessionData; etabId: string }> {
  const a = await accesPaie()
  if (!a || !a.validation) return { erreur: "Cette action est réservée à l'administrateur, au gestionnaire et au comptable." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}