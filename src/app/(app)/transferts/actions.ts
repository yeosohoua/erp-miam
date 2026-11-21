"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { accesTransferts } from "@/lib/transfert-acces"
import { expedierTransfert as expedier, recevoirTransfert as recevoir } from "@/lib/transfert"

const NB_LIGNES = 5
const rafraichir = () => {
  for (const p of ["/transferts", "/stock", "/reappro"]) revalidatePath(p, "layout")
}
const nettoyer = (v: FormDataEntryValue | null): string => String(v ?? "").trim()

async function contexte() {
  const a = await accesTransferts()
  if (!a || !a.etab) return null
  return { session: a.session, etabId: a.etab.id, etabNom: a.etab.name }
}

export async function creerTransfert(_p: EtatAction, fd: FormData): Promise<EtatAction> {
  const c = await contexte()
  if (!c) return { error: "Action réservée à la cuisine centrale, au magasin et à la direction." }
  const destId = nettoyer(fd.get("destId"))
  const note = nettoyer(fd.get("note")).slice(0, 200)
  if (!destId) return { error: "Choisissez la destination." }
  if (destId === c.etabId) return { error: "La destination doit être un autre établissement." }
  const dest = await db.etablissement.findFirst({ where: { id: destId, active: true }, select: { id: true, name: true } })
  if (!dest) return { error: "Destination invalide." }
  const saisies: { ingredientId: string; quantite: number }[] = []
  for (let i = 0; i < NB_LIGNES; i++) {
    const ing = nettoyer(fd.get("ing" + i))
    const brut = nettoyer(fd.get("qte" + i)).replace(",", ".")
    if (!ing && !brut) continue
    if (!ing) return { error: "Ligne " + (i + 1) + " : choisissez un ingrédient." }
    if (!/^\d{1,7}(\.\d{1,3})?$/.test(brut) || Number(brut) <= 0) return { error: "Quantité invalide à la ligne " + (i + 1) + "." }
    saisies.push({ ingredientId: ing, quantite: Number(brut) })
  }
  if (saisies.length === 0) return { error: "Ajoutez au moins une ligne." }
  const ingredients = await db.ingredient.findMany({ where: { etablissementId: c.etabId, id: { in: saisies.map((s) => s.ingredientId) } }, select: { id: true, name: true, unit: true } })
  const parId = new Map(ingredients.map((i) => [i.id, i]))
  const vus = new Set<string>()
  for (const s of saisies) {
    const ing = parId.get(s.ingredientId)
    if (!ing) return { error: "Ingrédient introuvable." }
    if (vus.has(s.ingredientId)) return { error: "Ingrédient en double : " + ing.name + "." }
    vus.add(s.ingredientId)
  }
  try {
    const t = await db.$transaction(async (tx) => {
      const max = await tx.transfert.aggregate({ where: { sourceId: c.etabId }, _max: { numero: true } })
      return tx.transfert.create({
        data: {
          sourceId: c.etabId,
          destId: dest.id,
          numero: (max._max.numero ?? 0) + 1,
          note: note || null,
          creePar: c.session.email,
          lignes: { create: saisies.map((s) => ({ ingredientId: s.ingredientId, ingredientNom: parId.get(s.ingredientId)!.name, unite: parId.get(s.ingredientId)!.unit, quantite: s.quantite })) },
        },
      })
    })
    await ecrireAudit({ userId: c.session.userId, userEmail: c.session.email, action: "TRANSFERT_CREE", entity: "Transfert", entityId: t.id, details: "n° " + t.numero + " vers " + dest.name + ", " + saisies.length + " ligne(s)" })
    rafraichir()
    return { ok: "Transfert n° " + t.numero + " créé (préparé), il part vers " + dest.name + "." }
  } catch (e) {
    console.error("Creation de transfert en echec", e)
    return { error: "Création impossible, réessayez." }
  }
}

export async function expedierTransfert(id: string, _p: EtatAction, _fd: FormData): Promise<EtatAction> {
  const c = await contexte()
  if (!c) return { error: "Action réservée à la cuisine centrale, au magasin et à la direction." }
  const r = await expedier(id, c.etabId, c.session.email)
  if ("erreur" in r) return { error: r.erreur }
  await ecrireAudit({ userId: c.session.userId, userEmail: c.session.email, action: "TRANSFERT_EXPEDIE", entity: "Transfert", entityId: id, details: r.ok })
  rafraichir()
  return { ok: r.ok }
}

export async function recevoirTransfert(id: string, _p: EtatAction, _fd: FormData): Promise<EtatAction> {
  const c = await contexte()
  if (!c) return { error: "Action réservée à la cuisine centrale, au magasin et à la direction." }
  const r = await recevoir(id, c.etabId, c.session.email)
  if ("erreur" in r) return { error: r.erreur }
  await ecrireAudit({ userId: c.session.userId, userEmail: c.session.email, action: "TRANSFERT_RECU", entity: "Transfert", entityId: id, details: r.ok })
  rafraichir()
  return { ok: r.ok }
}

export async function annulerTransfert(id: string, _p: EtatAction, _fd: FormData): Promise<EtatAction> {
  const c = await contexte()
  if (!c) return { error: "Action réservée à la cuisine centrale, au magasin et à la direction." }
  const r = await db.transfert.updateMany({ where: { id, sourceId: c.etabId, statut: "PREPARE" }, data: { statut: "ANNULE" } })
  if (r.count !== 1) return { error: "Seul un transfert préparé peut être annulé." }
  await ecrireAudit({ userId: c.session.userId, userEmail: c.session.email, action: "TRANSFERT_ANNULE", entity: "Transfert", entityId: id, details: "Transfert annulé avant expédition" })
  rafraichir()
  return { ok: "Transfert annulé." }
}