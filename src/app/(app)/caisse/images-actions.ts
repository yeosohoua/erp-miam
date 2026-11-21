"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { accesCaisseConfig } from "@/lib/caisse-acces"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { lireFichierImage } from "@/lib/image-stockage"

const rafraichir = () => revalidatePath("/caisse", "layout")

export async function televerserImageArticle(id: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const a = await accesCaisseConfig()
  if ("erreur" in a) return { error: a.erreur }
  const art = await db.articleCarte.findFirst({ where: { id, etablissementId: a.etabId }, select: { id: true, nom: true, imageId: true } })
  if (!art) return { error: "Article introuvable." }
  const l = await lireFichierImage(fd.get("image"))
  if ("erreur" in l) return { error: l.erreur }
  await db.$transaction(async (tx) => {
    const img = await tx.image.create({ data: { etablissementId: a.etabId, mime: l.mime, taille: l.octets.byteLength, donnees: l.octets } })
    await tx.articleCarte.update({ where: { id: art.id }, data: { imageId: img.id } })
    if (art.imageId) await tx.image.deleteMany({ where: { id: art.imageId } })
  })
  await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "ARTICLE_IMAGE", entity: "ArticleCarte", entityId: art.id, details: art.nom })
  rafraichir()
  return { ok: "Image de " + art.nom + " enregistrée." }
}

export async function retirerImageArticle(id: string, _fd: FormData): Promise<void> {
  const a = await accesCaisseConfig()
  if ("erreur" in a) return
  const art = await db.articleCarte.findFirst({ where: { id, etablissementId: a.etabId }, select: { id: true, nom: true, imageId: true } })
  if (!art || !art.imageId) return
  await db.$transaction(async (tx) => {
    await tx.articleCarte.update({ where: { id: art.id }, data: { imageId: null } })
    await tx.image.deleteMany({ where: { id: art.imageId! } })
  })
  await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "ARTICLE_IMAGE_RETIREE", entity: "ArticleCarte", entityId: art.id, details: art.nom })
  rafraichir()
}