"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"

import { accesStockEcriture } from "@/lib/approvisionnement-acces"
import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { aujourdhui, dateValide, formaterNombre, serviceValide } from "@/lib/menus"
import { alerterStock } from "@/lib/notifications"
import { ErreurStock, decompterConsommation, entrerStock, sortirStock } from "@/lib/stock"
import { parseQuantite, q3 } from "@/lib/stock-base"

const rafraichir = () => {
  revalidatePath("/stock", "layout")
  revalidatePath("/achats", "layout")
  revalidatePath("/", "layout")
}
const nettoyer = (v: FormDataEntryValue | null): string => String(v ?? "").trim()

export async function definirSeuil(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesStockEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const ingredientId = nettoyer(fd.get("ingredientId"))
  const seuil = parseQuantite(nettoyer(fd.get("seuil")), true)
  if (!ingredientId) return { error: "Choisissez un ingrédient." }
  if (seuil === null) return { error: "Quantité invalide : un nombre positif ou nul." }
  const ing = await db.ingredient.findFirst({ where: { id: ingredientId, etablissementId: etabId }, select: { id: true, name: true } })
  if (!ing) return { error: "Ingrédient introuvable." }
  await db.ingredient.update({ where: { id: ing.id }, data: { seuil } })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "STOCK_SEUIL", entity: "Ingredient", entityId: ing.id, details: ing.name + " : " + seuil })
  rafraichir()
  return { ok: "Seuil enregistré." }
}

// PERTE : quantite perdue. INVENTAIRE : quantite comptee (le stock est aligne sur elle).
export async function ajusterStock(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesStockEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const ingredientId = nettoyer(fd.get("ingredientId"))
  const type = nettoyer(fd.get("type"))
  const note = nettoyer(fd.get("note"))
  if (!ingredientId) return { error: "Choisissez un ingrédient." }
  if (type !== "PERTE" && type !== "INVENTAIRE") return { error: "Type d'ajustement invalide." }
  const quantite = parseQuantite(nettoyer(fd.get("quantite")), type === "INVENTAIRE")
  if (quantite === null) return { error: type === "PERTE" ? "Quantité invalide : un nombre supérieur à zéro." : "Quantité invalide : un nombre positif ou nul." }
  if (note.length < 3) return { error: "Indiquez le motif (3 caractères minimum)." }
  if (note.length > 200) return { error: "Motif trop long (200 caractères maximum)." }
  try {
    const message = await db.$transaction(async (tx) => {
      const ing = await tx.ingredient.findFirst({ where: { id: ingredientId, etablissementId: etabId }, select: { id: true, stock: true, unitCost: true } })
      if (!ing) throw new ErreurStock("Ingrédient introuvable.")
      const courant = Number(ing.stock)
      if (type === "PERTE") {
        if (quantite > courant) throw new ErreurStock("La perte dépasse le stock disponible.")
        await sortirStock(tx, { etabId, ingredientId, quantite, type: "PERTE", note, userEmail: session.email })
        return "Perte enregistrée."
      }
      const ecart = q3(quantite - courant)
      if (ecart === 0) return "Stock déjà conforme à l'inventaire."
      if (ecart > 0) await entrerStock(tx, { etabId, ingredientId, quantite: ecart, prix: Number(ing.unitCost), peremption: null, reference: "Inventaire", type: "INVENTAIRE", note, userEmail: session.email })
      else await sortirStock(tx, { etabId, ingredientId, quantite: -ecart, type: "INVENTAIRE", note, userEmail: session.email })
      return "Inventaire enregistré (écart " + formaterNombre(ecart) + ")."
    })
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: type === "PERTE" ? "STOCK_PERTE" : "STOCK_INVENTAIRE", entity: "Ingredient", entityId: ingredientId, details: type + " " + quantite + " — " + note })
    after(() => alerterStock(etabId))
    rafraichir()
    return { ok: message }
  } catch (e) {
    if (e instanceof ErreurStock) return { error: e.message }
    console.error("Ajustement de stock en echec", e)
    return { error: "Ajustement impossible, réessayez." }
  }
}

export async function rebuterLot(lotId: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _etat
  void _fd
  const acces = await accesStockEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const lot = await db.lot.findFirst({ where: { id: lotId, etablissementId: etabId }, include: { ingredient: { select: { name: true } } } })
  if (!lot) return { error: "Lot introuvable." }
  const reste = Number(lot.restante)
  if (reste <= 0) return { error: "Ce lot est déjà vide." }
  await db.$transaction(async (tx) => {
    await tx.lot.update({ where: { id: lot.id }, data: { restante: 0 } })
    await tx.mouvementStock.create({
      data: { etablissementId: etabId, ingredientId: lot.ingredientId, lotId: lot.id, type: "PERTE", quantite: -reste, prix: lot.prix, reference: lot.reference, note: "Rebut du lot " + lot.reference, userEmail: session.email },
    })
    await tx.ingredient.update({ where: { id: lot.ingredientId }, data: { stock: { decrement: reste } } })
  })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "STOCK_REBUT", entity: "Lot", entityId: lot.id, details: lot.ingredient.name + " " + lot.reference + " : " + reste })
  after(() => alerterStock(etabId))
  rafraichir()
  return { ok: "Lot rebuté." }
}

export async function decompter(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesStockEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const date = nettoyer(fd.get("date"))
  const service = nettoyer(fd.get("service"))
  if (!dateValide(date)) return { error: "Date invalide." }
  if (!serviceValide(service)) return { error: "Service invalide." }
  if (date > aujourdhui()) return { error: "Cette date est dans le futur." }
  const r = await decompterConsommation({ etabId, dateIso: date, service, userEmail: session.email })
  if ("erreur" in r) return { error: r.erreur }
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "STOCK_CONSOMMATION", entity: "Consommation", entityId: etabId + ":" + date + ":" + service, details: date + " " + service })
  after(() => alerterStock(etabId))
  rafraichir()
  return { ok: r.ok }
}