"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { requireSession } from "@/lib/guards"
import { lireFichierImage } from "@/lib/image-stockage"
import { dateValide, serviceValide, versDate } from "@/lib/menus"
import { accesMenus } from "@/lib/menus-acces"

const rafraichir = () => revalidatePath("/menus", "layout")

async function contexte() {
  const session = await requireSession()
  const acces = await accesMenus()
  if (!acces || !acces.ecriture || !acces.etab) return null
  return { session, etabId: acces.etab.id }
}

async function trouverMenu(etabId: string, date: string, service: string) {
  if (!dateValide(date) || !serviceValide(service)) return null
  return db.menu.findUnique({
    where: { etablissementId_date_service: { etablissementId: etabId, date: versDate(date), service } },
    select: { id: true, imageId: true },
  })
}

export async function televerserImageMenu(date: string, service: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const c = await contexte()
  if (!c) return { error: "Action non autorisée pour votre rôle." }
  const menu = await trouverMenu(c.etabId, date, service)
  if (!menu) return { error: "Ajoutez d'abord un plat à ce menu." }
  const l = await lireFichierImage(fd.get("image"))
  if ("erreur" in l) return { error: l.erreur }
  await db.$transaction(async (tx) => {
    const img = await tx.image.create({ data: { etablissementId: c.etabId, mime: l.mime, taille: l.octets.byteLength, donnees: l.octets } })
    await tx.menu.update({ where: { id: menu.id }, data: { imageId: img.id } })
    if (menu.imageId) await tx.image.deleteMany({ where: { id: menu.imageId } })
  })
  await ecrireAudit({ userId: c.session.userId, userEmail: c.session.email, action: "MENU_IMAGE", entity: "Menu", entityId: menu.id, details: date + " " + service })
  rafraichir()
  return { ok: "Image enregistrée." }
}

export async function retirerImageMenu(date: string, service: string, _fd: FormData): Promise<void> {
  void _fd
  const c = await contexte()
  if (!c) return
  const menu = await trouverMenu(c.etabId, date, service)
  if (!menu || !menu.imageId) return
  await db.$transaction(async (tx) => {
    await tx.menu.update({ where: { id: menu.id }, data: { imageId: null } })
    await tx.image.deleteMany({ where: { id: menu.imageId! } })
  })
  await ecrireAudit({ userId: c.session.userId, userEmail: c.session.email, action: "MENU_IMAGE_RETIREE", entity: "Menu", entityId: menu.id, details: date + " " + service })
  rafraichir()
}