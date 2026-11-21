import "server-only"

import { contexteEtablissement, type EtabResume } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { COMPTA_CLOTURE, COMPTA_ECRITURE, COMPTA_LECTURE, hasRole } from "@/lib/permissions"
import type { SessionData } from "@/lib/session-token"

export type AccesCompta = { session: SessionData; etab: EtabResume | null; ecriture: boolean; cloture: boolean }

export async function accesCompta(): Promise<AccesCompta | null> {
  const session = await requireSession()
  if (!hasRole(session.role, COMPTA_LECTURE)) return null
  const { courant } = await contexteEtablissement()
  return { session, etab: courant, ecriture: hasRole(session.role, COMPTA_ECRITURE), cloture: hasRole(session.role, COMPTA_CLOTURE) }
}

export async function accesComptaEcriture(): Promise<{ erreur: string } | { session: SessionData; etabId: string }> {
  const a = await accesCompta()
  if (!a || !a.ecriture) return { erreur: "Action non autorisée pour votre rôle." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}

export async function accesComptaCloture(): Promise<{ erreur: string } | { session: SessionData; etabId: string }> {
  const a = await accesCompta()
  if (!a || !a.cloture) return { erreur: "La clôture est réservée à l'administrateur et au comptable." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}