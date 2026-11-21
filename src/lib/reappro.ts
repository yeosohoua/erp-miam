import "server-only"

import { db } from "@/lib/db"
import { aujourdhui } from "@/lib/menus"
import { NOTE_REAPPRO, grouperParFournisseur, quantiteACommander } from "@/lib/reappro-base"

export type PropositionReappro = {
  regleId: string
  ingredientId: string
  nom: string
  unite: string
  stock: number
  enCommande: number
  cible: number
  aCommander: number
  fournisseurId: string | null
  fournisseurNom: string | null
  delaiJours: number
  prixUnitaire: number
}

export async function propositionsReappro(etabId: string): Promise<PropositionReappro[]> {
  const regles = await db.regleReappro.findMany({
    where: { etablissementId: etabId, actif: true },
    include: { ingredient: { select: { name: true, unit: true, unitCost: true, stock: true } } },
  })
  if (regles.length === 0) return []
  const ids = regles.map((r) => r.ingredientId)
  const fournisseurIds = Array.from(new Set(regles.map((r) => r.fournisseurId).filter((x): x is string => x !== null)))
  const [fournisseurs, lignes] = await Promise.all([
    fournisseurIds.length > 0 ? db.fournisseur.findMany({ where: { etablissementId: etabId, id: { in: fournisseurIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    db.bonCommandeLigne.findMany({
      where: { ingredientId: { in: ids }, bon: { etablissementId: etabId, statut: { in: ["DRAFT", "SENT", "PARTIAL"] } } },
      select: { ingredientId: true, quantite: true, recue: true },
    }),
  ])
  const nomFournisseur = new Map(fournisseurs.map((f) => [f.id, f.name]))
  const enCommande = new Map<string, number>()
  for (const l of lignes) enCommande.set(l.ingredientId, (enCommande.get(l.ingredientId) ?? 0) + Math.max(0, Number(l.quantite) - Number(l.recue)))
  const sortie: PropositionReappro[] = []
  for (const r of regles) {
    const stock = Number(r.ingredient.stock)
    const encours = enCommande.get(r.ingredientId) ?? 0
    const aCommander = quantiteACommander({ stock, enCommande: encours, cible: Number(r.cible) })
    if (aCommander <= 0) continue
    const fid = r.fournisseurId && nomFournisseur.has(r.fournisseurId) ? r.fournisseurId : null
    sortie.push({
      regleId: r.id,
      ingredientId: r.ingredientId,
      nom: r.ingredient.name,
      unite: r.ingredient.unit,
      stock,
      enCommande: encours,
      cible: Number(r.cible),
      aCommander,
      fournisseurId: fid,
      fournisseurNom: fid ? (nomFournisseur.get(fid) ?? null) : null,
      delaiJours: r.delaiJours,
      prixUnitaire: Number(r.ingredient.unitCost),
    })
  }
  return sortie.sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
}

// Cree ou complete un bon BROUILLON par fournisseur. Les quantites deja en brouillon comptent comme "en commande" : relancer ne duplique rien.
export async function genererBonsReappro(etabId: string): Promise<{ bons: number; lignes: number; sansFournisseur: number }> {
  const props = await propositionsReappro(etabId)
  const { groupes, sansFournisseur } = grouperParFournisseur(props)
  const jour = aujourdhui().split("-").reverse().join("/")
  let bons = 0
  let lignes = 0
  for (const [fournisseurId, liste] of groupes) {
    await db.$transaction(async (tx) => {
      let bon = await tx.bonCommande.findFirst({ where: { etablissementId: etabId, fournisseurId, statut: "DRAFT", note: { startsWith: NOTE_REAPPRO } } })
      if (!bon) bon = await tx.bonCommande.create({ data: { etablissementId: etabId, fournisseurId, note: NOTE_REAPPRO + " du " + jour } })
      for (const l of liste) {
        const existante = await tx.bonCommandeLigne.findUnique({ where: { bonId_ingredientId: { bonId: bon.id, ingredientId: l.ingredientId } } })
        if (existante) await tx.bonCommandeLigne.update({ where: { id: existante.id }, data: { quantite: { increment: l.aCommander } } })
        else await tx.bonCommandeLigne.create({ data: { bonId: bon.id, ingredientId: l.ingredientId, quantite: l.aCommander, prix: l.prixUnitaire } })
      }
    })
    bons += 1
    lignes += liste.length
  }
  return { bons, lignes, sansFournisseur: sansFournisseur.length }
}