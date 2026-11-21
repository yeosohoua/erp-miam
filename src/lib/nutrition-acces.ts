import "server-only"

import { contexteEtablissement, type EtabResume } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { NUTRITION_ECRITURE, NUTRITION_LECTURE, hasRole } from "@/lib/permissions"
import type { SessionData } from "@/lib/session-token"

export type AccesNutrition = { session: SessionData; etab: EtabResume | null; ecriture: boolean }

export async function accesNutrition(): Promise<AccesNutrition | null> {
  const session = await requireSession()
  if (!hasRole(session.role, NUTRITION_LECTURE)) return null
  const { courant } = await contexteEtablissement()
  return { session, etab: courant, ecriture: hasRole(session.role, NUTRITION_ECRITURE) }
}

export async function accesNutritionEcriture(): Promise<{ erreur: string } | { session: SessionData; etabId: string }> {
  const a = await accesNutrition()
  if (!a || !a.ecriture) return { erreur: "Action non autorisée pour votre rôle." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}