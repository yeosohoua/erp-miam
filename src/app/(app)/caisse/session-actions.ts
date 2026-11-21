"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { accesCaisse, accesCaisseConfig, accesCaisseVente } from "@/lib/caisse-acces"
import { FOND_MAX, parseMontantZero } from "@/lib/caisse-base"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { cloturerSessionCaisse, ouvrirSessionCaisse } from "@/lib/session-caisse"

const texte = (v: FormDataEntryValue | null): string => (typeof v === "string" ? v.trim() : "")
const rafraichir = () => revalidatePath("/caisse", "layout")

export async function ouvrirCaisse(_p: EtatAction, fd: FormData): Promise<EtatAction> {
  const a = await accesCaisseVente()
  if ("erreur" in a) return { error: a.erreur }
  const fond = parseMontantZero(texte(fd.get("fond")))
  if (fond === null || fond > FOND_MAX) return { error: "Fond de caisse invalide : un entier positif ou zéro." }
  const r = await ouvrirSessionCaisse({ etabId: a.etabId, email: a.session.email, fond })
  if ("erreur" in r) return { error: r.erreur }
  await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "SESSION_OUVERTE", entity: "SessionCaisse", entityId: String(r.numero), details: "fond " + fond })
  rafraichir()
  return { ok: "Caisse n° " + r.numero + " ouverte." }
}

export async function cloturerCaisse(id: string, _p: EtatAction, fd: FormData): Promise<EtatAction> {
  const a = await accesCaisse()
  if (!a || !a.etab) return { error: "La caisse est réservée au caissier, au gestionnaire et à l'administrateur." }
  const compte = parseMontantZero(texte(fd.get("compte")))
  if (compte === null) return { error: "Montant compté invalide : un entier positif ou zéro." }
  const note = texte(fd.get("note")).slice(0, 200)
  const r = await cloturerSessionCaisse({ etabId: a.etab.id, sessionId: id, email: a.session.email, gestionnaire: a.config, compte, note })
  if ("erreur" in r) return { error: r.erreur }
  await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "SESSION_CLOTUREE", entity: "SessionCaisse", entityId: String(r.numero), details: "attendu " + r.attendu + ", compté " + compte + ", écart " + r.ecart })
  rafraichir()
  return { ok: "Caisse n° " + r.numero + " clôturée : attendu " + r.attendu + " FCFA, compté " + compte + " FCFA, écart " + r.ecart + " FCFA." }
}

export async function basculerObligationSession(_fd: FormData): Promise<void> {
  const a = await accesCaisseConfig()
  if ("erreur" in a) return
  const e = await db.etablissement.findUnique({ where: { id: a.etabId }, select: { sessionCaisseObligatoire: true } })
  if (!e) return
  await db.etablissement.update({ where: { id: a.etabId }, data: { sessionCaisseObligatoire: !e.sessionCaisseObligatoire } })
  await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "CAISSE_OBLIGATION", entity: "Etablissement", entityId: a.etabId, details: e.sessionCaisseObligatoire ? "non" : "oui" })
  rafraichir()
}