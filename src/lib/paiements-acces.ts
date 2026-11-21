import "server-only"

import { contexteEtablissement, type EtabResume } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { PAIEMENTS_CONFIG, PAIEMENTS_ECRITURE, PAIEMENTS_LECTURE, hasRole } from "@/lib/permissions"
import type { SessionData } from "@/lib/session-token"

export type AccesPaiements = { session: SessionData; etab: EtabResume | null; ecriture: boolean; config: boolean }

export async function accesPaiements(): Promise<AccesPaiements | null> {
  const session = await requireSession()
  if (!hasRole(session.role, PAIEMENTS_LECTURE)) return null
  const { courant } = await contexteEtablissement()
  return { session, etab: courant, ecriture: hasRole(session.role, PAIEMENTS_ECRITURE), config: hasRole(session.role, PAIEMENTS_CONFIG) }
}

export async function accesPaiementsEcriture(): Promise<{ erreur: string } | { session: SessionData; etabId: string }> {
  const a = await accesPaiements()
  if (!a || !a.ecriture) return { erreur: "Action non autorisée pour votre rôle." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}

export async function accesPaiementsConfig(): Promise<{ erreur: string } | { session: SessionData; etabId: string }> {
  const a = await accesPaiements()
  if (!a || !a.config) return { erreur: "Action réservée aux responsables." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}