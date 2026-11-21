import "server-only"

import { db } from "@/lib/db"
import { ErreurStock, entrerStock, sortirStock } from "@/lib/stock"
import { coutMoyenPondere, noteSortie, referenceTransfert, regrouperParLot } from "@/lib/transfert-base"

type Resultat = { erreur: string } | { ok: string }

function traduire(e: unknown, contexte: string): { erreur: string } {
  if (e instanceof ErreurStock) return { erreur: e.message }
  console.error(contexte, e)
  return { erreur: contexte + " impossible, réessayez." }
}

// Expedition : sortie FEFO du stock de la source, cout moyen pondere par ligne. Tout ou rien.
export async function expedierTransfert(id: string, etabId: string, userEmail: string): Promise<Resultat> {
  try {
    return await db.$transaction(async (tx) => {
      const t = await tx.transfert.findFirst({ where: { id, sourceId: etabId }, include: { lignes: true, source: { select: { code: true } } } })
      if (!t) throw new ErreurStock("Transfert introuvable.")
      if (t.statut !== "PREPARE") throw new ErreurStock("Ce transfert n'est plus à l'état préparé.")
      const claim = await tx.transfert.updateMany({ where: { id: t.id, statut: "PREPARE" }, data: { statut: "EXPEDIE", expediLe: new Date() } })
      if (claim.count !== 1) throw new ErreurStock("Transfert déjà traité.")
      const note = noteSortie(t.source.code, t.numero)
      for (const l of t.lignes) {
        if (!l.ingredientId) throw new ErreurStock("Ingrédient introuvable : " + l.ingredientNom)
        const ing = await tx.ingredient.findFirst({ where: { id: l.ingredientId, etablissementId: etabId }, select: { id: true } })
        if (!ing) throw new ErreurStock("Ingrédient introuvable : " + l.ingredientNom)
        const r = await sortirStock(tx, { etabId, ingredientId: ing.id, quantite: Number(l.quantite), type: "SORTIE", note, userEmail })
        if (r.manque > 0) throw new ErreurStock("Stock insuffisant pour " + l.ingredientNom + " : il manque " + r.manque + " " + l.unite + ".")
        const mouvs = await tx.mouvementStock.findMany({ where: { etablissementId: etabId, ingredientId: ing.id, note, type: "SORTIE" } })
        const cout = coutMoyenPondere(mouvs.map((m) => ({ quantite: -Number(m.quantite), prix: Number(m.prix ?? 0) })))
        await tx.transfertLigne.update({ where: { id: l.id }, data: { cout } })
      }
      return { ok: "Transfert n° " + t.numero + " expédié." }
    })
  } catch (e) {
    return traduire(e, "Expédition")
  }
}

// Reception : entree en stock a destination, lots recrees avec la peremption et le prix d'origine.
export async function recevoirTransfert(id: string, etabId: string, userEmail: string): Promise<Resultat> {
  try {
    return await db.$transaction(async (tx) => {
      const t = await tx.transfert.findFirst({ where: { id, destId: etabId }, include: { lignes: true, source: { select: { code: true, name: true } } } })
      if (!t) throw new ErreurStock("Transfert introuvable.")
      if (t.statut !== "EXPEDIE") throw new ErreurStock("Ce transfert n'est pas en attente de réception.")
      const claim = await tx.transfert.updateMany({ where: { id: t.id, statut: "EXPEDIE" }, data: { statut: "RECU", recuLe: new Date() } })
      if (claim.count !== 1) throw new ErreurStock("Transfert déjà traité.")
      const note = noteSortie(t.source.code, t.numero)
      const reference = referenceTransfert(t.source.code, t.numero)
      for (const l of t.lignes) {
        let dest = await tx.ingredient.findUnique({ where: { etablissementId_name: { etablissementId: etabId, name: l.ingredientNom } } })
        if (!dest) dest = await tx.ingredient.create({ data: { etablissementId: etabId, name: l.ingredientNom, unit: l.unite, unitCost: l.cout } })
        const mouvs = l.ingredientId ? await tx.mouvementStock.findMany({ where: { etablissementId: t.sourceId, ingredientId: l.ingredientId, note, type: "SORTIE" } }) : []
        const parLot = regrouperParLot(mouvs.map((m) => ({ lotId: m.lotId, quantite: -Number(m.quantite) })))
        const lotIds = Array.from(parLot.keys()).filter((x): x is string => x !== null)
        const lots = lotIds.length > 0 ? await tx.lot.findMany({ where: { id: { in: lotIds } } }) : []
        const infoLot = new Map(lots.map((x) => [x.id, x]))
        let recu = 0
        for (const [lotId, quantite] of parLot) {
          if (quantite <= 0) continue
          const lot = lotId ? infoLot.get(lotId) : undefined
          await entrerStock(tx, { etabId, ingredientId: dest.id, quantite, prix: lot ? Number(lot.prix) : Number(l.cout), peremption: lot ? lot.peremption : null, reference, type: "ENTREE", note: "Transfert depuis " + t.source.name, userEmail })
          recu += quantite
        }
        const reste = Math.round((Number(l.quantite) - recu) * 1000) / 1000
        if (reste > 0) await entrerStock(tx, { etabId, ingredientId: dest.id, quantite: reste, prix: Number(l.cout), peremption: null, reference, type: "ENTREE", note: "Transfert depuis " + t.source.name, userEmail })
      }
      return { ok: "Transfert n° " + t.numero + " reçu : le stock est mis à jour." }
    })
  } catch (e) {
    return traduire(e, "Réception")
  }
}