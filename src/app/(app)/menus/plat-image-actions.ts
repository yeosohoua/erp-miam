"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { requireSession } from "@/lib/guards"
import { lireFichierImage } from "@/lib/image-stockage"
import { accesMenus } from "@/lib/menus-acces"

const rafraichir = () => revalidatePath("/menus", "layout")

async function contexte() {
  const session = await requireSession()
  const acces = await accesMenus()
  if (!acces || !acces.ecriture || !acces.etab) return null
  return { session, etabId: acces.etab.id }
}

export async function televerserImagePlat(id: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const c = await contexte()
  if (!c) return { error: "Action non autorisée pour votre rôle." }
  const plat = await db.plat.findFirst({ where: { id, etablissementId: c.etabId }, select: { id: true, name: true, imageId: true } })
  if (!plat) return { error: "Plat introuvable." }
  const l = await lireFichierImage(fd.get("image"))
  if ("erreur" in l) return { error: l.erreur }
  await db.$transaction(async (tx) => {
    const img = await tx.image.create({ data: { etablissementId: c.etabId, mime: l.mime, taille: l.octets.byteLength, donnees: l.octets } })
    await tx.plat.update({ where: { id: plat.id }, data: { imageId: img.id } })
    if (plat.imageId) await tx.image.deleteMany({ where: { id: plat.imageId } })
  })
  await ecrireAudit({ userId: c.session.userId, userEmail: c.session.email, action: "PLAT_IMAGE", entity: "Plat", entityId: plat.id, details: plat.name })
  rafraichir()
  return { ok: "Image enregistrée." }
}

export async function retirerImagePlat(id: string, _fd: FormData): Promise<void> {
  const c = await contexte()
  if (!c) return
  const plat = await db.plat.findFirst({ where: { id, etablissementId: c.etabId }, select: { id: true, name: true, imageId: true } })
  if (!plat || !plat.imageId) return
  await db.$transaction(async (tx) => {
    await tx.plat.update({ where: { id: plat.id }, data: { imageId: null } })
    await tx.image.deleteMany({ where: { id: plat.imageId! } })
  })
  await ecrireAudit({ userId: c.session.userId, userEmail: c.session.email, action: "PLAT_IMAGE_RETIREE", entity: "Plat", entityId: plat.id, details: plat.name })
  rafraichir()
}