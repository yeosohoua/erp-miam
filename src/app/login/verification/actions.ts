"use server"

import { redirect } from "next/navigation"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { effacerDefi, lireDefi } from "@/lib/defi-2fa"
import { cleLimite, effacerEchecs, enregistrerEchec, secondesAvantReessai } from "@/lib/rate-limit"
import { dechiffrer } from "@/lib/secret-box"
import { createSession } from "@/lib/session"
import { hacherCode, verifierTotp } from "@/lib/totp"

export type VerifEtat = { error?: string } | undefined

export async function verifier2fa(_etat: VerifEtat, fd: FormData): Promise<VerifEtat> {
  const defi = await lireDefi()
  if (!defi) redirect("/login")

  const cle = cleLimite("2fa:" + defi.userId)
  const attente = await secondesAvantReessai(cle)
  if (attente > 0) return { error: "Trop de tentatives. Réessayez dans " + Math.ceil(attente / 60) + " minute(s)." }

  const user = await db.user.findUnique({ where: { id: defi.userId } })
  if (!user || !user.active || user.tokenVersion !== defi.tv || !user.totpEnabled || !user.totpSecret) {
    await effacerDefi()
    redirect("/login")
  }

  const saisie = String(fd.get("code") ?? "").replace(/\s+/g, "")
  let reussi = false
  let parSecours = false

  if (/^\d{6}$/.test(saisie)) {
    const secret = dechiffrer(user.totpSecret)
    const pas = secret ? verifierTotp(secret, saisie, user.totpLastStep) : null
    if (pas !== null) {
      // Comparer-et-ecrire : un meme code ne peut pas etre accepte deux fois, meme en parallele.
      const maj = await db.user.updateMany({ where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: pas } }] }, data: { totpLastStep: pas } })
      reussi = maj.count === 1
    }
  } else if (saisie.length >= 8) {
    const h = hacherCode(saisie)
    if (user.recoveryCodes.includes(h)) {
      const maj = await db.user.updateMany({ where: { id: user.id, recoveryCodes: { has: h } }, data: { recoveryCodes: user.recoveryCodes.filter((x) => x !== h) } })
      reussi = maj.count === 1
      parSecours = reussi
    }
  }

  if (!reussi) {
    await enregistrerEchec(cle)
    await ecrireAudit({ userId: user.id, userEmail: user.email, action: "LOGIN_2FA_FAILED" })
    return { error: "Code incorrect." }
  }

  await effacerEchecs(cle)
  await effacerDefi()
  await createSession({ userId: user.id, role: String(user.role), name: user.name, email: user.email, tv: user.tokenVersion })
  await ecrireAudit({ userId: user.id, userEmail: user.email, action: "LOGIN_OK", details: parSecours ? "2FA code de secours" : "2FA" })
  redirect("/")
}