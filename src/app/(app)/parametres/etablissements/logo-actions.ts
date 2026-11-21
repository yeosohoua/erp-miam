"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { requireSession } from "@/lib/guards"
import { lireFichierImage } from "@/lib/image-stockage"
import { ETABLISSEMENTS_ADMIN, ETABLISSEMENT_EDITION, hasRole } from "@/lib/permissions"

async function autorise(etablissementId: string): Promise<{ userId: string; email: string } | null> {
  const s = await requireSession()
  if (!hasRole(s.role, ETABLISSEMENTS_ADMIN)) {
    if (!hasRole(s.role, ETABLISSEMENT_EDITION)) return null
    const lien = await db.userEtablissement.findUnique({ where: { userId_etablissementId: { userId: s.userId, etablissementId } } })
    if (!lien) return null
  }
  return { userId: s.userId, email: s.email }
}

export async function televerserLogo(etablissementId: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const u = await autorise(etablissementId)
  if (!u) return { error: "Action non autorisée." }
  const l = await lireFichierImage(fd.get("image"))
  if ("erreur" in l) return { error: l.erreur }
  const e = await db.etablissement.findUnique({ where: { id: etablissementId }, select: { id: true, logoId: true } })
  if (!e) return { error: "Établissement introuvable." }
  await db.$transaction(async (tx) => {
    const img = await tx.image.create({ data: { etablissementId: e.id, mime: l.mime, taille: l.octets.byteLength, donnees: l.octets } })
    await tx.etablissement.update({ where: { id: e.id }, data: { logoId: img.id } })
    if (e.logoId) await tx.image.deleteMany({ where: { id: e.logoId } })
  })
  await ecrireAudit({ userId: u.userId, userEmail: u.email, action: "ETABLISSEMENT_LOGO", entity: "Etablissement", entityId: e.id })
  revalidatePath("/parametres", "layout")
  return { ok: "Logo enregistré." }
}

export async function retirerLogo(etablissementId: string, _fd: FormData): Promise<void> {
  const u = await autorise(etablissementId)
  if (!u) return
  const e = await db.etablissement.findUnique({ where: { id: etablissementId }, select: { id: true, logoId: true } })
  if (!e || !e.logoId) return
  await db.$transaction(async (tx) => {
    await tx.etablissement.update({ where: { id: e.id }, data: { logoId: null } })
    await tx.image.deleteMany({ where: { id: e.logoId! } })
  })
  await ecrireAudit({ userId: u.userId, userEmail: u.email, action: "ETABLISSEMENT_LOGO_RETIRE", entity: "Etablissement", entityId: e.id })
  revalidatePath("/parametres", "layout")
}