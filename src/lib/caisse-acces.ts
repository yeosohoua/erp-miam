import "server-only"

import { contexteEtablissement, type EtabResume } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { CAISSE_ACCES, CAISSE_ANNULATION, CAISSE_CONFIG, hasRole } from "@/lib/permissions"
import type { SessionData } from "@/lib/session-token"

export type AccesCaisse = { session: SessionData; etab: EtabResume | null; config: boolean; annulation: boolean }
type Autorisation = { erreur: string } | { session: SessionData; etabId: string }

export async function accesCaisse(): Promise<AccesCaisse | null> {
  const session = await requireSession()
  if (!hasRole(session.role, CAISSE_ACCES)) return null
  const { courant } = await contexteEtablissement()
  return { session, etab: courant, config: hasRole(session.role, CAISSE_CONFIG), annulation: hasRole(session.role, CAISSE_ANNULATION) }
}

async function exiger(droit: "acces" | "config" | "annulation", message: string): Promise<Autorisation> {
  const a = await accesCaisse()
  if (!a || (droit !== "acces" && !a[droit])) return { erreur: message }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}

export const accesCaisseVente = () => exiger("acces", "La caisse est réservée au caissier, au gestionnaire et à l'administrateur.")
export const accesCaisseConfig = () => exiger("config", "La gestion des articles est réservée au gestionnaire et à l'administrateur.")
export const accesCaisseAnnulation = () => exiger("annulation", "L'annulation d'une vente est réservée au gestionnaire et à l'administrateur.")