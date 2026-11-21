"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { accesFamille, enfantDe } from "@/lib/famille"
import { lireFichierImage } from "@/lib/image-stockage"

const rafraichir = () => {
  revalidatePath("/famille", "layout")
  revalidatePath("/inscrits", "layout")
}

// Un parent ne peut agir que sur ses propres enfants (lien par l'e-mail du tuteur).
export async function televerserPhotoEnfant(inscritId: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const session = await accesFamille()
  if (!session) return { error: "Action réservée aux parents." }
  const enfant = await enfantDe(session.email, inscritId)
  if (!enfant) return { error: "Enfant introuvable." }
  const l = await lireFichierImage(fd.get("image"))
  if ("erreur" in l) return { error: l.erreur }
  await db.$transaction(async (tx) => {
    const img = await tx.image.create({ data: { etablissementId: enfant.etablissementId, mime: l.mime, taille: l.octets.byteLength, donnees: l.octets } })
    await tx.inscrit.update({ where: { id: enfant.id }, data: { imageId: img.id } })
    if (enfant.imageId) await tx.image.deleteMany({ where: { id: enfant.imageId } })
  })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "INSCRIT_PHOTO", entity: "Inscrit", entityId: enfant.id })
  rafraichir()
  return { ok: "Photo enregistrée." }
}

export async function retirerPhotoEnfant(inscritId: string, _fd: FormData): Promise<void> {
  const session = await accesFamille()
  if (!session) return
  const enfant = await enfantDe(session.email, inscritId)
  if (!enfant || !enfant.imageId) return
  await db.$transaction(async (tx) => {
    await tx.inscrit.update({ where: { id: enfant.id }, data: { imageId: null } })
    await tx.image.deleteMany({ where: { id: enfant.imageId! } })
  })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "INSCRIT_PHOTO_RETIREE", entity: "Inscrit", entityId: enfant.id })
  rafraichir()
}