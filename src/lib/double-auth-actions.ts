"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { controleMotDePasse } from "@/lib/controle-mdp"
import { db } from "@/lib/db"
import type { EtatAction, EtatCodes } from "@/lib/etat-action"
import { requireSession } from "@/lib/guards"
import { UTILISATEURS_ADMIN, hasRole } from "@/lib/permissions"
import { cleLimite, effacerEchecs, enregistrerEchec, secondesAvantReessai } from "@/lib/rate-limit"
import { chiffrer, dechiffrer } from "@/lib/secret-box"
import { createSession } from "@/lib/session"
import { genererSecret, hacherCode, nouveauxCodes, verifierTotp } from "@/lib/totp"

export async function demarrer2fa(_etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _fd
  const session = await requireSession()
  const u = await db.user.findUnique({ where: { id: session.userId }, select: { totpEnabled: true } })
  if (!u) return { error: "Compte introuvable." }
  if (u.totpEnabled) return { error: "La double authentification est déjà active." }
  await db.user.update({ where: { id: session.userId }, data: { totpSecret: chiffrer(genererSecret()) } })
  revalidatePath("/compte")
  return { ok: "Scannez le code QR puis saisissez le code à 6 chiffres." }
}

export async function confirmer2fa(_etat: EtatCodes, fd: FormData): Promise<EtatCodes> {
  const session = await requireSession()
  const cle = cleLimite("tfa-setup:" + session.userId)
  const attente = await secondesAvantReessai(cle)
  if (attente > 0) return { error: "Trop de tentatives. Réessayez dans " + Math.ceil(attente / 60) + " minute(s)." }
  const u = await db.user.findUnique({ where: { id: session.userId }, select: { totpEnabled: true, totpSecret: true } })
  if (!u) return { error: "Compte introuvable." }
  if (u.totpEnabled) return { error: "La double authentification est déjà active." }
  const secret = u.totpSecret ? dechiffrer(u.totpSecret) : null
  if (!secret) return { error: "Démarrez d'abord l'activation." }
  const pas = verifierTotp(secret, String(fd.get("code") ?? "").replace(/\s+/g, ""), null)
  if (pas === null) {
    await enregistrerEchec(cle)
    return { error: "Code incorrect." }
  }
  await effacerEchecs(cle)
  const codes = nouveauxCodes()
  // Les autres sessions sont coupees ; la session courante est reouverte avec la nouvelle version.
  const maj = await db.user.update({
    where: { id: session.userId },
    data: { totpEnabled: true, totpLastStep: pas, recoveryCodes: codes.map(hacherCode), tokenVersion: { increment: 1 } },
  })
  await createSession({ userId: session.userId, role: session.role, name: session.name, email: session.email, tv: maj.tokenVersion })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "TWO_FACTOR_ENABLED", entity: "User", entityId: session.userId })
  revalidatePath("/compte")
  return { ok: "Double authentification activée.", codes }
}

export async function regenererCodesSecours(_etat: EtatCodes, fd: FormData): Promise<EtatCodes> {
  const session = await requireSession()
  const erreur = await controleMotDePasse(session.userId, String(fd.get("motdepasse") ?? ""))
  if (erreur) return { error: erreur }
  const u = await db.user.findUnique({ where: { id: session.userId }, select: { totpEnabled: true } })
  if (!u?.totpEnabled) return { error: "La double authentification n'est pas active." }
  const codes = nouveauxCodes()
  await db.user.update({ where: { id: session.userId }, data: { recoveryCodes: codes.map(hacherCode) } })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "RECOVERY_CODES_REGENERATED", entity: "User", entityId: session.userId })
  revalidatePath("/compte")
  return { ok: "Nouveaux codes de secours générés. Les anciens ne fonctionnent plus.", codes }
}

export async function desactiver2fa(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const session = await requireSession()
  const erreur = await controleMotDePasse(session.userId, String(fd.get("motdepasse") ?? ""))
  if (erreur) return { error: erreur }
  const maj = await db.user.update({
    where: { id: session.userId },
    data: { totpEnabled: false, totpSecret: null, totpLastStep: null, recoveryCodes: [], tokenVersion: { increment: 1 } },
  })
  await createSession({ userId: session.userId, role: session.role, name: session.name, email: session.email, tv: maj.tokenVersion })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "TWO_FACTOR_DISABLED", entity: "User", entityId: session.userId })
  revalidatePath("/compte")
  return { ok: "Double authentification désactivée." }
}

export async function reinitialiser2faUtilisateur(id: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _fd
  const session = await requireSession()
  if (!hasRole(session.role, UTILISATEURS_ADMIN)) return { error: "Action réservée à l'administrateur." }
  if (id === session.userId) return { error: "Pour votre propre compte, utilisez « Mon compte »." }
  const cible = await db.user.findUnique({ where: { id }, select: { email: true } })
  if (!cible) return { error: "Cet utilisateur n'existe plus." }
  await db.user.update({
    where: { id },
    data: { totpEnabled: false, totpSecret: null, totpLastStep: null, recoveryCodes: [], tokenVersion: { increment: 1 } },
  })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "TWO_FACTOR_RESET", entity: "User", entityId: id, details: cible.email })
  revalidatePath("/parametres/utilisateurs/" + id)
  return { ok: "Double authentification réinitialisée." }
}