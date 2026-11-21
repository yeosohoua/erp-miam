import "server-only"

import { contexteEtablissement, type EtabResume } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { ACHATS_ECRITURE, ACHATS_LECTURE, RECEPTION_ECRITURE, STOCK_ECRITURE, STOCK_LECTURE, hasRole } from "@/lib/permissions"
import type { SessionData } from "@/lib/session-token"

export type AccesStock = { session: SessionData; etab: EtabResume | null; ecriture: boolean }
export type AccesAchats = AccesStock & { reception: boolean }
type Ecriture = { erreur: string } | { session: SessionData; etabId: string }

export async function accesStock(): Promise<AccesStock | null> {
  const session = await requireSession()
  if (!hasRole(session.role, STOCK_LECTURE)) return null
  const { courant } = await contexteEtablissement()
  return { session, etab: courant, ecriture: hasRole(session.role, STOCK_ECRITURE) }
}

export async function accesStockEcriture(): Promise<Ecriture> {
  const a = await accesStock()
  if (!a || !a.ecriture) return { erreur: "Action non autorisée pour votre rôle." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}

export async function accesAchats(): Promise<AccesAchats | null> {
  const session = await requireSession()
  if (!hasRole(session.role, ACHATS_LECTURE)) return null
  const { courant } = await contexteEtablissement()
  return { session, etab: courant, ecriture: hasRole(session.role, ACHATS_ECRITURE), reception: hasRole(session.role, RECEPTION_ECRITURE) }
}

export async function accesAchatsEcriture(): Promise<Ecriture> {
  const a = await accesAchats()
  if (!a || !a.ecriture) return { erreur: "Action non autorisée pour votre rôle." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}

export async function accesReception(): Promise<Ecriture> {
  const a = await accesAchats()
  if (!a || !a.reception) return { erreur: "Action non autorisée pour votre rôle." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}