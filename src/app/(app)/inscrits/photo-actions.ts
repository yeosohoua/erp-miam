"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { lireFichierImage } from "@/lib/image-stockage"
import { accesEcriture } from "@/lib/inscrits-acces"

const rafraichir = () => {
  revalidatePath("/inscrits", "layout")
  revalidatePath("/famille", "layout")
}

export async function televerserPhotoInscrit(inscritId: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const a = await accesEcriture()
  if ("erreur" in a) return { error: a.erreur }
  const l = await lireFichierImage(fd.get("image"))
  if ("erreur" in l) return { error: l.erreur }
  const ins = await db.inscrit.findFirst({ where: { id: inscritId, etablissementId: a.etabId }, select: { id: true, imageId: true } })
  if (!ins) return { error: "Inscrit introuvable." }
  await db.$transaction(async (tx) => {
    const img = await tx.image.create({ data: { etablissementId: a.etabId, mime: l.mime, taille: l.octets.byteLength, donnees: l.octets } })
    await tx.inscrit.update({ where: { id: ins.id }, data: { imageId: img.id } })
    if (ins.imageId) await tx.image.deleteMany({ where: { id: ins.imageId } })
  })
  await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "INSCRIT_PHOTO", entity: "Inscrit", entityId: ins.id })
  rafraichir()
  return { ok: "Photo enregistrée." }
}

export async function retirerPhotoInscrit(inscritId: string, _fd: FormData): Promise<void> {
  const a = await accesEcriture()
  if ("erreur" in a) return
  const ins = await db.inscrit.findFirst({ where: { id: inscritId, etablissementId: a.etabId }, select: { id: true, imageId: true } })
  if (!ins || !ins.imageId) return
  await db.$transaction(async (tx) => {
    await tx.inscrit.update({ where: { id: ins.id }, data: { imageId: null } })
    await tx.image.deleteMany({ where: { id: ins.imageId! } })
  })
  await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "INSCRIT_PHOTO_RETIREE", entity: "Inscrit", entityId: ins.id })
  rafraichir()
}