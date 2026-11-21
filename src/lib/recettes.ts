import "server-only"

import { db } from "@/lib/db"
import { ajouterJours, aujourdhui, libelleCourt, versDate, versIso } from "@/lib/menus"
import { PERIODES, variation, type PeriodeCle } from "@/lib/tableau-bord"

// Recharges encaissees et repas consommes, jour par jour, sur la periode du tableau de bord.
export async function chargerRecettes(etabId: string, periode: PeriodeCle) {
  const n = PERIODES[periode].jours
  const fin = aujourdhui()
  const nb = Math.max(n, 7)
  const debutGraph = ajouterJours(fin, -(nb - 1))
  const debutPeriode = ajouterJours(fin, -(n - 1))
  const [etab, lignes, soldes, nbOperations] = await Promise.all([
    db.etablissement.findUnique({ where: { id: etabId }, select: { prepaye: true } }),
    db.transaction.findMany({
      where: { etablissementId: etabId, type: { in: ["TOPUP", "DEBIT", "REFUND"] }, createdAt: { gte: versDate(debutGraph), lt: versDate(ajouterJours(fin, 1)) } },
      select: { createdAt: true, type: true, montant: true },
    }),
    db.inscrit.aggregate({ where: { etablissementId: etabId }, _sum: { solde: true } }),
    db.transaction.count({ where: { etablissementId: etabId } }),
  ])
  const parJour = new Map<string, { recharges: number; consomme: number }>()
  for (const l of lignes) {
    const j = versIso(l.createdAt)
    const e = parJour.get(j) ?? { recharges: 0, consomme: 0 }
    if (l.type === "TOPUP") e.recharges += l.montant
    else e.consomme -= l.montant
    parJour.set(j, e)
  }
  const serie = Array.from({ length: nb }, (_, i) => {
    const jour = ajouterJours(debutGraph, i)
    const e = parJour.get(jour) ?? { recharges: 0, consomme: 0 }
    return { jour, label: libelleCourt(jour), recharges: e.recharges, consomme: e.consomme }
  })
  const dansPeriode = serie.filter((s) => s.jour >= debutPeriode)
  return {
    actif: !!etab?.prepaye || nbOperations > 0,
    recharges: dansPeriode.reduce((t, s) => t + s.recharges, 0),
    consomme: dansPeriode.reduce((t, s) => t + s.consomme, 0),
    encours: soldes._sum.solde ?? 0,
    serie,
  }
}

// Revenu de la periode : ventes de la caisse (nettes des remboursements) + repas debites des comptes hors caisse.
// Les debits de caisse portent la reference CAISSE-n et sont deja comptes dans les ventes.
export async function chargerRevenu(etabId: string, periode: PeriodeCle) {
  const n = PERIODES[periode].jours
  const fin = aujourdhui()
  const debut = ajouterJours(fin, -(n - 1))
  const debutPrec = ajouterJours(debut, -n)
  const mesure = async (de: string, jusqua: string) => {
    const plage = { gte: versDate(de), lt: versDate(ajouterJours(jusqua, 1)) }
    const [ventes, rembs, repas] = await Promise.all([
      db.venteComptoir.aggregate({ where: { etablissementId: etabId, statut: "PAYEE", createdAt: plage }, _sum: { total: true }, _count: { _all: true } }),
      db.venteRemboursement.aggregate({ where: { vente: { etablissementId: etabId, statut: "PAYEE", createdAt: plage } }, _sum: { montant: true } }),
      db.transaction.aggregate({ where: { etablissementId: etabId, type: "DEBIT", createdAt: plage, OR: [{ reference: null }, { NOT: { reference: { startsWith: "CAISSE-" } } }] }, _sum: { montant: true } }),
    ])
    const caisse = (ventes._sum.total ?? 0) - (rembs._sum.montant ?? 0)
    const repasComptes = -(repas._sum.montant ?? 0)
    return { caisse, tickets: ventes._count._all, repas: repasComptes, revenu: caisse + repasComptes }
  }
  const [courant, prec] = await Promise.all([mesure(debut, fin), mesure(debutPrec, ajouterJours(debut, -1))])
  return { ...courant, variation: variation(courant.revenu, prec.revenu) }
}