import "server-only"

import { contexteEtablissement, type EtabResume } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { PRODUCTION_ADMIN, PRODUCTION_COMMANDE, PRODUCTION_ECRITURE, PRODUCTION_LECTURE, hasRole } from "@/lib/permissions"
import type { SessionData } from "@/lib/session-token"

export type AccesProduction = { session: SessionData; etab: EtabResume | null; ecriture: boolean; admin: boolean; commande: boolean }
type Autorisation = { erreur: string } | { session: SessionData; etabId: string }

export async function accesProduction(): Promise<AccesProduction | null> {
  const session = await requireSession()
  if (!hasRole(session.role, PRODUCTION_LECTURE)) return null
  const { courant } = await contexteEtablissement()
  return {
    session,
    etab: courant,
    ecriture: hasRole(session.role, PRODUCTION_ECRITURE),
    admin: hasRole(session.role, PRODUCTION_ADMIN),
    commande: hasRole(session.role, PRODUCTION_COMMANDE),
  }
}

async function exiger(droit: "ecriture" | "admin" | "commande", message: string): Promise<Autorisation> {
  const a = await accesProduction()
  if (!a || !a[droit]) return { erreur: message }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}

export const accesProductionEcriture = () => exiger("ecriture", "Action non autorisée pour votre rôle.")
export const accesProductionAdmin = () => exiger("admin", "Action réservée à l'administrateur et au gestionnaire.")
export const accesProductionCommande = () => exiger("commande", "La génération de bons est réservée à l'achat, au gestionnaire et à l'administrateur.")