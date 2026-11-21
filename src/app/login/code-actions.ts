"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { ecrireAudit } from "@/lib/audit"
import { hacherCodeAcces, utilisateurPourCode } from "@/lib/codes-acces"
import { CIBLES_CONNEXION_CODE, codeValide, normaliserCode } from "@/lib/codes-acces-base"
import { db } from "@/lib/db"
import { cleLimite, effacerEchecs, enregistrerEchec, secondesAvantReessai } from "@/lib/rate-limit"
import { createSession } from "@/lib/session"

import type { LoginState } from "./actions"

async function adresseIp(): Promise<string> {
  try {
    const h = await headers()
    const transfere = h.get("x-forwarded-for")
    if (transfere) return transfere.split(",")[0].trim().slice(0, 64)
    return h.get("x-real-ip")?.slice(0, 64) ?? "inconnue"
  } catch {
    return "inconnue"
  }
}

export async function connexionCode(_etat: LoginState, fd: FormData): Promise<LoginState> {
  const etabSaisi = String(fd.get("etab") ?? "").trim().slice(0, 40)
  const code = normaliserCode(String(fd.get("code") ?? ""))
  const cleIp = cleLimite("code-ip:" + (await adresseIp()))
  const cleEtab = cleLimite("code-etab:" + etabSaisi)

  const attente = Math.max(await secondesAvantReessai(cleIp), await secondesAvantReessai(cleEtab))
  if (attente > 0) {
    await ecrireAudit({ action: "LOGIN_CODE_BLOCKED", details: etabSaisi })
    return { error: "Trop de tentatives. Réessayez dans " + Math.ceil(attente / 60) + " minute(s)." }
  }
  const echec = async (): Promise<LoginState> => {
    await enregistrerEchec(cleIp)
    await enregistrerEchec(cleEtab, 20)
    await ecrireAudit({ action: "LOGIN_CODE_FAILED", details: etabSaisi })
    return { error: "Code ou établissement incorrect." }
  }

  if (!etabSaisi || !codeValide(code)) return echec()
  const empreinte = hacherCodeAcces(code)
  const etab = await db.etablissement.findFirst({ where: { code: { equals: etabSaisi, mode: "insensitive" }, active: true }, select: { id: true } })
  if (!etab) return echec()
  const acces = await db.codeAcces.findUnique({ where: { etablissementId_codeHash: { etablissementId: etab.id, codeHash: empreinte } }, select: { id: true, actif: true, cible: true } })
  if (!acces || !acces.actif || !(CIBLES_CONNEXION_CODE as readonly string[]).includes(String(acces.cible))) return echec()

  const r = await utilisateurPourCode(acces.id)
  if ("erreur" in r) return { error: r.erreur }

  await effacerEchecs(cleIp)
  await createSession({ userId: r.user.id, role: r.user.role, name: r.user.name, email: r.user.email, tv: r.user.tokenVersion })
  await ecrireAudit({ userId: r.user.id, userEmail: r.user.email, action: "LOGIN_CODE_OK", details: r.cible })
  redirect(r.cible === "PARENT" ? "/famille" : "/mon-espace")
}