"use server"

import { compare, hash } from "bcryptjs"
import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { requireSession } from "@/lib/guards"
import { validerMotDePasse } from "@/lib/password-policy"
import { cleLimite, effacerEchecs, enregistrerEchec, secondesAvantReessai } from "@/lib/rate-limit"
import { createSession } from "@/lib/session"

export async function modifierProfil(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const session = await requireSession()
  const nom = String(fd.get("nom") ?? "").trim()
  if (nom.length < 2 || nom.length > 80) return { error: "Le nom doit contenir entre 2 et 80 caractères." }
  await db.user.update({ where: { id: session.userId }, data: { name: nom } })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "PROFILE_UPDATED", entity: "User", entityId: session.userId })
  revalidatePath("/", "layout")
  return { ok: "Profil enregistré." }
}

export async function changerMotDePasse(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const session = await requireSession()
  const cle = "pwd:" + cleLimite(session.userId)
  const attente = await secondesAvantReessai(cle)
  if (attente > 0) return { error: "Trop de tentatives. Réessayez dans " + Math.ceil(attente / 60) + " minute(s)." }

  const actuel = String(fd.get("actuel") ?? "")
  const nouveau = String(fd.get("nouveau") ?? "")
  const confirmation = String(fd.get("confirmation") ?? "")
  const utilisateur = await db.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true, tokenVersion: true, role: true, name: true, email: true } })
  if (!utilisateur) return { error: "Compte introuvable." }

  if (!(await compare(actuel, utilisateur.passwordHash))) {
    await enregistrerEchec(cle)
    return { error: "Mot de passe actuel incorrect." }
  }
  const erreurMdp = validerMotDePasse(nouveau)
  if (erreurMdp) return { error: erreurMdp }
  if (nouveau !== confirmation) return { error: "La confirmation ne correspond pas au nouveau mot de passe." }
  if (nouveau === actuel) return { error: "Le nouveau mot de passe doit être différent de l'actuel." }

  // Les autres sessions sont coupees (version du jeton), la session courante est reouverte avec la nouvelle version.
  const maj = await db.user.update({ where: { id: session.userId }, data: { passwordHash: await hash(nouveau, 12), tokenVersion: { increment: 1 } } })
  await effacerEchecs(cle)
  await createSession({ userId: session.userId, role: String(utilisateur.role), name: utilisateur.name, email: utilisateur.email, tv: maj.tokenVersion })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "PASSWORD_CHANGED", entity: "User", entityId: session.userId })
  return { ok: "Mot de passe modifié." }
}