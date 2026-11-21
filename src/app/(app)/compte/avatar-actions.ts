"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { requireSession } from "@/lib/guards"
import { lireFichierImage } from "@/lib/image-stockage"

export async function televerserAvatar(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const session = await requireSession()
  const l = await lireFichierImage(fd.get("image"))
  if ("erreur" in l) return { error: l.erreur }
  const u = await db.user.findUnique({ where: { id: session.userId }, select: { imageId: true } })
  if (!u) return { error: "Compte introuvable." }
  await db.$transaction(async (tx) => {
    const img = await tx.image.create({ data: { etablissementId: null, mime: l.mime, taille: l.octets.byteLength, donnees: l.octets } })
    await tx.user.update({ where: { id: session.userId }, data: { imageId: img.id } })
    if (u.imageId) await tx.image.deleteMany({ where: { id: u.imageId } })
  })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "AVATAR_MIS_A_JOUR", entity: "User", entityId: session.userId })
  revalidatePath("/", "layout")
  return { ok: "Photo enregistrée." }
}

export async function retirerAvatar(_fd: FormData): Promise<void> {
  const session = await requireSession()
  const u = await db.user.findUnique({ where: { id: session.userId }, select: { imageId: true } })
  if (!u || !u.imageId) return
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: session.userId }, data: { imageId: null } })
    await tx.image.deleteMany({ where: { id: u.imageId! } })
  })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "AVATAR_RETIRE", entity: "User", entityId: session.userId })
  revalidatePath("/", "layout")
}