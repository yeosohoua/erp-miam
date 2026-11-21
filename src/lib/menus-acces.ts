import "server-only"

import { db } from "@/lib/db"
import { contexteEtablissement, type EtabResume } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { MENUS_ECRITURE, MENUS_LECTURE, hasRole } from "@/lib/permissions"
import type { SessionData } from "@/lib/session-token"

export type AccesMenus = { session: SessionData; etab: EtabResume | null; ecriture: boolean; devise: string }

// Lecture : roles du module. L'etablissement actif est toujours calcule cote serveur.
export async function accesMenus(): Promise<AccesMenus | null> {
  const session = await requireSession()
  if (!hasRole(session.role, MENUS_LECTURE)) return null
  const { courant } = await contexteEtablissement()
  const devise = courant ? ((await db.etablissement.findUnique({ where: { id: courant.id }, select: { currency: true } }))?.currency ?? "XOF") : "XOF"
  return { session, etab: courant, ecriture: hasRole(session.role, MENUS_ECRITURE), devise }
}

export async function accesMenusEcriture(): Promise<{ erreur: string } | { session: SessionData; etabId: string }> {
  const a = await accesMenus()
  if (!a || !a.ecriture) return { erreur: "Action non autorisée pour votre rôle." }
  if (!a.etab) return { erreur: "Aucun établissement actif." }
  return { session: a.session, etabId: a.etab.id }
}