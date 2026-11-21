import "server-only"

import { db } from "@/lib/db"
import { ajouterJours, aujourdhui, versDate } from "@/lib/menus"
import { KPIS, statutObjectif, trierAlertes, type Alerte, type KpiId, type SensKpi, type StatutObjectif } from "@/lib/pilotage-base"
import { JOURS_ALERTE } from "@/lib/stock-base"

export async function calculerKpis(etabId: string): Promise<Record<KpiId, number | null>> {
  const jour = aujourdhui()
  const debut30 = versDate(ajouterJours(jour, -29))
  const debut7 = new Date(Date.now() - 7 * 864e5)
  const [consos, notes, releves, retard, nc, mouvements, ingredients] = await Promise.all([
    db.consommation.findMany({ where: { etablissementId: etabId, date: { gte: debut30 } }, select: { repas: true } }),
    db.avis.aggregate({ where: { etablissementId: etabId, date: { gte: debut30 } }, _avg: { note: true }, _count: { _all: true } }),
    db.releveTemperature.findMany({ where: { etablissementId: etabId, mesureLe: { gte: debut7 } }, select: { conforme: true } }),
    db.facture.count({ where: { etablissementId: etabId, statut: "ISSUED", echeance: { lt: versDate(jour) } } }),
    db.nonConformite.count({ where: { etablissementId: etabId, statut: "OUVERTE" } }),
    db.mouvementStock.findMany({ where: { etablissementId: etabId, type: "SORTIE", consommationId: { not: null }, createdAt: { gte: debut30 } }, select: { quantite: true, prix: true } }),
    db.ingredient.findMany({ where: { etablissementId: etabId, seuil: { gt: 0 } }, select: { stock: true, seuil: true } }),
  ])
  const repas = consos.reduce((s, c) => s + c.repas, 0)
  const cout = mouvements.reduce((s, m) => s + Math.abs(Number(m.quantite)) * Number(m.prix ?? 0), 0)
  return {
    repas_servis: consos.length === 0 ? null : repas,
    cout_repas: repas > 0 && mouvements.length > 0 ? Math.round(cout / repas) : null,
    satisfaction: notes._count._all === 0 || notes._avg.note === null ? null : Math.round(notes._avg.note * 10) / 10,
    conformite_temperatures: releves.length === 0 ? null : Math.round((releves.filter((r) => r.conforme).length / releves.length) * 100),
    factures_retard: retard,
    nc_ouvertes: nc,
    stock_critique: ingredients.filter((i) => Number(i.stock) <= Number(i.seuil)).length,
  }
}

export type LigneKpi = { id: KpiId; libelle: string; unite: string; decimales: number; sens: SensKpi; valeur: number | null; cible: number | null; statut: StatutObjectif | null }

export async function tableauKpis(etabId: string): Promise<LigneKpi[]> {
  const [valeurs, objectifs] = await Promise.all([calculerKpis(etabId), db.objectifKpi.findMany({ where: { etablissementId: etabId } })])
  return KPIS.map((k) => {
    const o = objectifs.find((x) => x.kpi === k.id)
    const cible = o ? Number(o.cible) : null
    const valeur = valeurs[k.id]
    return { id: k.id, libelle: k.libelle, unite: k.unite, decimales: k.decimales, sens: k.sens, valeur, cible, statut: cible === null ? null : statutObjectif(valeur, cible, k.sens) }
  })
}

export async function chargerAlertes(etabId: string): Promise<Alerte[]> {
  const jour = aujourdhui()
  const limiteLots = versDate(ajouterJours(jour, JOURS_ALERTE))
  const [ingredients, lotsProches, ncOuvertes, tachesQuot, execJour, temoins, retard, conges, suggestions, soldesNegatifs] = await Promise.all([
    db.ingredient.findMany({ where: { etablissementId: etabId, seuil: { gt: 0 } }, select: { stock: true, seuil: true } }),
    db.lot.count({ where: { etablissementId: etabId, restante: { gt: 0 }, peremption: { not: null, lte: limiteLots } } }),
    db.nonConformite.findMany({ where: { etablissementId: etabId, statut: "OUVERTE" }, select: { gravite: true } }),
    db.tacheHygiene.findMany({ where: { etablissementId: etabId, actif: true, frequence: "QUOTIDIENNE" }, select: { id: true } }),
    db.executionHygiene.findMany({ where: { etablissementId: etabId, date: versDate(jour) }, select: { tacheId: true } }),
    db.echantillonTemoin.count({ where: { etablissementId: etabId, jete: false, conserveJusqu: { lte: versDate(jour) } } }),
    db.facture.count({ where: { etablissementId: etabId, statut: "ISSUED", echeance: { lt: versDate(jour) } } }),
    db.conge.count({ where: { etablissementId: etabId, statut: "DEMANDE" } }),
    db.suggestion.count({ where: { etablissementId: etabId, statut: "NOUVELLE" } }),
    db.inscrit.count({ where: { etablissementId: etabId, statut: "ACTIVE", solde: { lt: 0 } } }),
  ])
  const alertes: Alerte[] = []
  const sousSeuil = ingredients.filter((i) => Number(i.stock) <= Number(i.seuil)).length
  if (sousSeuil > 0) alertes.push({ code: "STOCK_BAS", gravite: "IMPORTANT", titre: "Stock sous le seuil", detail: sousSeuil + " ingrédient(s) à réapprovisionner.", lien: "/stock" })
  if (lotsProches > 0) alertes.push({ code: "LOTS_PEREMPTION", gravite: "IMPORTANT", titre: "Lots périmés ou proche de la péremption", detail: lotsProches + " lot(s) à utiliser ou à retirer dans les " + JOURS_ALERTE + " jours.", lien: "/stock" })
  if (ncOuvertes.length > 0) {
    const critiques = ncOuvertes.filter((n) => n.gravite === "CRITIQUE").length
    alertes.push({ code: "NC_OUVERTES", gravite: critiques > 0 ? "CRITIQUE" : "IMPORTANT", titre: "Non-conformités d'hygiène ouvertes", detail: ncOuvertes.length + " ouverte(s), dont " + critiques + " critique(s).", lien: "/haccp?vue=nc" })
  }
  const faites = new Set(execJour.map((x) => x.tacheId))
  const restantes = tachesQuot.filter((t) => !faites.has(t.id)).length
  if (restantes > 0) alertes.push({ code: "HYGIENE_A_FAIRE", gravite: "INFO", titre: "Tâches d'hygiène du jour non validées", detail: restantes + " tâche(s) quotidienne(s) restante(s).", lien: "/haccp?vue=hygiene" })
  if (temoins > 0) alertes.push({ code: "TEMOINS_A_JETER", gravite: "INFO", titre: "Échantillons témoins à jeter", detail: temoins + " échantillon(s) ont dépassé leur durée de conservation.", lien: "/haccp?vue=temoins" })
  if (retard > 0) alertes.push({ code: "FACTURES_RETARD", gravite: "IMPORTANT", titre: "Factures en retard de paiement", detail: retard + " facture(s) échue(s) et non réglée(s).", lien: "/facturation" })
  if (soldesNegatifs > 0) alertes.push({ code: "SOLDES_NEGATIFS", gravite: "IMPORTANT", titre: "Comptes en solde négatif", detail: soldesNegatifs + " inscrit(s) actif(s) à recharger.", lien: "/inscrits" })
  if (conges > 0) alertes.push({ code: "CONGES_ATTENTE", gravite: "INFO", titre: "Demandes de congé en attente", detail: conges + " demande(s) à traiter.", lien: "/personnel" })
  if (suggestions > 0) alertes.push({ code: "SUGGESTIONS_NOUVELLES", gravite: "INFO", titre: "Nouvelles suggestions", detail: suggestions + " suggestion(s) non traitée(s).", lien: "/satisfaction?vue=suggestions" })
  return trierAlertes(alertes)
}