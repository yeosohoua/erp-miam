import "server-only"

import { compare } from "bcryptjs"

import { db } from "@/lib/db"
import { cleLimite, effacerEchecs, enregistrerEchec, secondesAvantReessai } from "@/lib/rate-limit"

// Verifie le mot de passe de l'utilisateur connecte ; compteur partage avec le changement de mot de passe. Renvoie un message d'erreur ou null.
export async function controleMotDePasse(userId: string, motDePasse: string): Promise<string | null> {
  const cle = "pwd:" + cleLimite(userId)
  const attente = await secondesAvantReessai(cle)
  if (attente > 0) return "Trop de tentatives. Réessayez dans " + Math.ceil(attente / 60) + " minute(s)."
  const u = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } })
  if (!u || !(await compare(motDePasse, u.passwordHash))) {
    await enregistrerEchec(cle)
    return "Mot de passe incorrect."
  }
  await effacerEchecs(cle)
  return null
}