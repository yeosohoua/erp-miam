import "server-only"

import type { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import { versDate, type ServiceMenu } from "@/lib/menus"
import { q3 } from "@/lib/stock-base"

export type Tx = Prisma.TransactionClient

// Erreur "metier" : fait annuler la transaction, son message est affichable.
export class ErreurStock extends Error {}

export async function entrerStock(
  tx: Tx,
  p: { etabId: string; ingredientId: string; quantite: number; prix: number | null; peremption: Date | null; reference: string; bonId?: string | null; type: "ENTREE" | "INVENTAIRE"; note?: string | null; userEmail: string },
) {
  const q = q3(p.quantite)
  const lot = await tx.lot.create({
    data: { etablissementId: p.etabId, ingredientId: p.ingredientId, reference: p.reference, quantite: q, restante: q, prix: p.prix ?? 0, peremption: p.peremption, bonId: p.bonId ?? null },
  })
  await tx.mouvementStock.create({
    data: { etablissementId: p.etabId, ingredientId: p.ingredientId, lotId: lot.id, type: p.type, quantite: q, prix: p.prix, reference: p.reference, note: p.note ?? null, bonId: p.bonId ?? null, userEmail: p.userEmail },
  })
  await tx.ingredient.update({ where: { id: p.ingredientId }, data: { stock: { increment: q } } })
  return lot
}

// Sortie FEFO : les lots qui perimment en premier partent en premier. Retourne la part non couverte (manque).
export async function sortirStock(
  tx: Tx,
  p: { etabId: string; ingredientId: string; quantite: number; type: "SORTIE" | "PERTE" | "INVENTAIRE"; note?: string | null; consommationId?: string | null; userEmail: string },
): Promise<{ sorti: number; manque: number }> {
  let reste = q3(p.quantite)
  let sorti = 0
  const lots = await tx.lot.findMany({
    where: { ingredientId: p.ingredientId, etablissementId: p.etabId, restante: { gt: 0 } },
    orderBy: [{ peremption: { sort: "asc", nulls: "last" } }, { recuLe: "asc" }],
  })
  for (const lot of lots) {
    if (reste <= 0) break
    const prend = q3(Math.min(Number(lot.restante), reste))
    if (prend <= 0) continue
    await tx.lot.update({ where: { id: lot.id }, data: { restante: { decrement: prend } } })
    await tx.mouvementStock.create({
      data: { etablissementId: p.etabId, ingredientId: p.ingredientId, lotId: lot.id, type: p.type, quantite: -prend, prix: lot.prix, reference: lot.reference, note: p.note ?? null, consommationId: p.consommationId ?? null, userEmail: p.userEmail },
    })
    reste = q3(reste - prend)
    sorti = q3(sorti + prend)
  }
  if (sorti > 0) await tx.ingredient.update({ where: { id: p.ingredientId }, data: { stock: { decrement: sorti } } })
  return { sorti, manque: reste }
}

// Decompte du stock d'apres le menu publie et les repas servis du creneau. Une seule fois par creneau.
export async function decompterConsommation(p: { etabId: string; dateIso: string; service: ServiceMenu; userEmail: string }): Promise<{ erreur: string } | { ok: string }> {
  const date = versDate(p.dateIso)
  const cle = { etablissementId_date_service: { etablissementId: p.etabId, date, service: p.service } }
  const menu = await db.menu.findUnique({ where: cle, include: { plats: { include: { plat: { include: { ingredients: true } } } } } })
  if (!menu || menu.statut !== "PUBLISHED") return { erreur: "Aucun menu publié pour ce créneau." }
  const repas = await db.reservation.count({ where: { etablissementId: p.etabId, date, service: p.service, statut: "BOOKED", servedAt: { not: null } } })
  if (repas === 0) return { erreur: "Aucun repas servi pour ce créneau." }
  if (await db.consommation.findUnique({ where: cle })) return { erreur: "Consommation déjà décomptée pour ce créneau." }

  const besoins = new Map<string, number>()
  for (const mp of menu.plats) {
    const portions = mp.plat.portions > 0 ? mp.plat.portions : 1
    for (const l of mp.plat.ingredients) besoins.set(l.ingredientId, (besoins.get(l.ingredientId) ?? 0) + (Number(l.quantity) * repas) / portions)
  }
  try {
    const manques = await db.$transaction(async (tx) => {
      const c = await tx.consommation.create({ data: { etablissementId: p.etabId, date, service: p.service, repas, userEmail: p.userEmail } })
      let manque = 0
      for (const [ingredientId, qte] of besoins) {
        const r = await sortirStock(tx, { etabId: p.etabId, ingredientId, quantite: q3(qte), type: "SORTIE", note: "Consommation " + p.dateIso + " " + p.service, consommationId: c.id, userEmail: p.userEmail })
        if (r.manque > 0) manque++
      }
      return manque
    })
    return { ok: "Consommation décomptée (" + repas + " repas)" + (manques > 0 ? " — stock insuffisant pour " + manques + " ingrédient(s)." : ".") }
  } catch (e) {
    if (e instanceof Error && (("code" in e && (e as { code?: string }).code === "P2002") || /unique/i.test(e.message))) return { erreur: "Consommation déjà décomptée pour ce créneau." }
    console.error("Decompte de consommation en echec", e)
    return { erreur: "Décompte impossible, réessayez." }
  }
}