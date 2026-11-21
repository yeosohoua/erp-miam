"use server"

import { compare, hash } from "bcryptjs"
import { redirect } from "next/navigation"
import { z } from "zod"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { cleLimite, effacerEchecs, enregistrerEchec, secondesAvantReessai } from "@/lib/rate-limit"
import { creerDefi } from "@/lib/defi-2fa"
import { createSession } from "@/lib/session"

const schema = z.object({
  email: z.email("Adresse e-mail invalide"),
  password: z.string().min(1, "Le mot de passe est requis"),
})

export type LoginState = { error?: string } | undefined

export async function login(_etat: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" }
  }

  const email = parsed.data.email.toLowerCase()
  const cle = cleLimite(email)
  const attente = await secondesAvantReessai(cle)
  if (attente > 0) {
    await ecrireAudit({ userEmail: email, action: "LOGIN_BLOCKED" })
    return { error: "Trop de tentatives. Réessayez dans " + Math.ceil(attente / 60) + " minute(s)." }
  }

  const user = await db.user.findUnique({ where: { email } })

  if (!user || !user.active) {
    await hash(parsed.data.password, 12)
    await enregistrerEchec(cle)
    await ecrireAudit({ userEmail: email, action: "LOGIN_FAILED" })
    return { error: "Identifiants incorrects" }
  }

  const valide = await compare(parsed.data.password, user.passwordHash)
  if (!valide) {
    await enregistrerEchec(cle)
    await ecrireAudit({ userId: user.id, userEmail: user.email, action: "LOGIN_FAILED" })
    return { error: "Identifiants incorrects" }
  }

  await effacerEchecs(cle)
  if (user.totpEnabled) {
    await creerDefi(user.id, user.tokenVersion)
    await ecrireAudit({ userId: user.id, userEmail: user.email, action: "LOGIN_2FA_REQUIRED" })
    redirect("/login/verification")
  }
  await createSession({
    userId: user.id,
    role: String(user.role),
    name: user.name,
    email: user.email,
    tv: user.tokenVersion,
  })
  await ecrireAudit({ userId: user.id, userEmail: user.email, action: "LOGIN_OK" })
  redirect("/")
}