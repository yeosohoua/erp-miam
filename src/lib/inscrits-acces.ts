import "server-only"

import { randomBytes } from "node:crypto"

import { contexteEtablissement, type EtabResume } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { INSCRITS_ECRITURE, INSCRITS_LECTURE, hasRole } from "@/lib/permissions"
import type { SessionData } from "@/lib/session-token"

export const nouveauBadge = (): string => randomBytes(8).toString("hex").toUpperCase()

export type AccesInscrits = { session: SessionData; etab: EtabResume | null; ecriture: boolean }

// Lecture : roles du module. L'etablissement actif est toujours calcule cote serveur.
export async function accesInscrits(): Promise<AccesInscrits | null> {
  const session = await requireSession()
  if (!hasRole(session.role, INSCRITS_LECTURE)) return null
  const { courant } = await contexteEtablissement()
  return { session, etab: courant, ecriture: hasRole(session.role, INSCRITS_ECRITURE) }
}

export async function accesEcriture(): Promise<{ erreur: string } | { session: SessionData; etabId: string }> {
  const a = await accesInscrits()
  if (!a || !a.ecriture) return { erreur: "Action non autorisée pour votre rôle." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}