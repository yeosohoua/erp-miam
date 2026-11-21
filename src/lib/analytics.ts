import "server-only"

import {
  ajouter,
  calendrier,
  evolution,
  joursDe,
  jourSemaine,
  JOURS_SEMAINE,
  libelleJourCourt,
  libelleMois,
  moisMoins,
  moyenne,
  pareto,
  pourcent,
  serieQuotidienne,
  somme,
  tendance,
  tranches,
  type PeriodeAnalytics,
  type PointJour,
  type TableExport,
} from "@/lib/analytics-base"
import { MODES } from "@/lib/caisse-base"
import { db } from "@/lib/db"
import { ORDRE_SERVICES, SERVICES, aujourdhui } from "@/lib/menus"
import { chargerGaspillage } from "@/lib/prevision"
import { TYPES_GASPILLAGE } from "@/lib/prevision-base"

export type Ctx = { etabId: string; fin: string; n: PeriodeAnalytics; debut: string; precDebut: string; jours: string[] }
export function contexte(etabId: string, n: PeriodeAnalytics): Ctx {
  const fin = aujourdhui()
  const jours = joursDe(fin, n)
  return { etabId, fin, n, debut: jours[0], precDebut: ajouter(jours[0], -n), jours }
}

const dd = (iso: string): Date => new Date(iso + "T00:00:00.000Z")
const iso = (d: Date): string => d.toISOString().slice(0, 10)
const finExcl = (c: Ctx): Date => dd(ajouter(c.fin, 1))
const plageDates = (c: Ctx) => ({ gte: dd(c.debut), lte: dd(c.fin) })
const plageTs = (c: Ctx) => ({ gte: dd(c.debut), lt: finExcl(c) })
const num = (x: unknown): number => Number(x ?? 0)
const LIBELLES_METHODE: Record<string, string> = { ...MODES, PAYSTACK: "Paystack", AUTRE: "Autre" }

// ---------------------------------------------------------------- Frequentation
export async function chargerFrequentation(c: Ctx) {
  const reservation = { etablissementId: c.etabId, statut: "BOOKED" as const, walkIn: false }
  const [conso, resJour, reserves, servisRes, walkIns] = await Promise.all([
    db.consommation.findMany({ where: { etablissementId: c.etabId, date: { gte: dd(c.precDebut), lte: dd(c.fin) } }, select: { date: true, service: true, repas: true } }),
    db.reservation.groupBy({ by: ["date"], where: { ...reservation, date: plageDates(c) }, _count: { _all: true } }),
    db.reservation.count({ where: { ...reservation, date: plageDates(c) } }),
    db.reservation.count({ where: { ...reservation, date: plageDates(c), servedAt: { not: null } } }),
    db.reservation.count({ where: { etablissementId: c.etabId, statut: "BOOKED", walkIn: true, servedAt: { not: null }, date: plageDates(c) } }),
  ])

  const parJour = new Map<string, number>()
  const parJourService = new Map<string, Record<string, number>>()
  const cellules = new Map<string, { somme: number; dates: Set<string> }>()
  let servisPrec = 0
  for (const r of conso) {
    const d = iso(r.date)
    if (d < c.debut) {
      servisPrec += r.repas
      continue
    }
    parJour.set(d, (parJour.get(d) ?? 0) + r.repas)
    const j = parJourService.get(d) ?? {}
    j[r.service] = (j[r.service] ?? 0) + r.repas
    parJourService.set(d, j)
    const k = jourSemaine(d) + "|" + r.service
    const cur = cellules.get(k) ?? { somme: 0, dates: new Set<string>() }
    cur.somme += r.repas
    cur.dates.add(d)
    cellules.set(k, cur)
  }
  const reservesJour = new Map(resJour.map((r) => [iso(r.date), r._count._all]))
  const serie = c.jours.map((date) => ({ date, label: libelleJourCourt(date), reserves: reservesJour.get(date) ?? 0, servis: parJour.get(date) ?? 0 }))
  const servis = somme(serie.map((p) => p.servis))
  const ouverts = serie.filter((p) => p.servis > 0)
  const meilleur = ouverts.length ? ouverts.reduce((m, p) => (p.servis > m.servis ? p : m)) : null

  const parServiceJour = c.jours.map((date) => ({ date, label: libelleJourCourt(date), ...Object.fromEntries(ORDRE_SERVICES.map((s) => [s, parJourService.get(date)?.[s] ?? 0])) })) as ({ date: string; label: string } & Record<string, number | string>)[]
  const parService = ORDRE_SERVICES.map((s) => ({ service: s, label: SERVICES[s], valeur: somme(c.jours.map((d) => parJourService.get(d)?.[s] ?? 0)) })).filter((x) => x.valeur > 0)
  const heatCases = JOURS_SEMAINE.map((_, j) =>
    ORDRE_SERVICES.map((s) => {
      const cell = cellules.get(j + "|" + s)
      return cell && cell.dates.size ? Math.round(cell.somme / cell.dates.size) : 0
    }),
  )

  const tables: TableExport[] = [
    { nom: "frequentation-journaliere", colonnes: ["Date", "Réservés", "Servis"], lignes: serie.map((p) => [p.date, p.reserves, p.servis]) },
    { nom: "frequentation-par-service", colonnes: ["Service", "Repas servis"], lignes: parService.map((p) => [p.label, p.valeur]) },
  ]
  return {
    kpi: {
      servis,
      servisPrec,
      evolution: evolution(servis, servisPrec),
      reserves,
      servisReserves: servisRes,
      absents: Math.max(0, reserves - servisRes),
      walkIns,
      presence: pourcent(servisRes, reserves),
      moyenneJour: Math.round(moyenne(ouverts.map((p) => p.servis))),
      meilleurJour: meilleur ? { label: meilleur.label, valeur: meilleur.servis } : null,
    },
    serie,
    parServiceJour,
    parService,
    heatmap: { jours: [...JOURS_SEMAINE], services: ORDRE_SERVICES.map((s) => ({ service: s, label: SERVICES[s] })), cases: heatCases, max: Math.max(0, ...heatCases.flat()) },
    calendrier: calendrier(c.jours, parJour),
    tendance: tendance(ouverts.map((p) => p.servis)),
    tables,
  }
}

// ---------------------------------------------------------------- Finances
export async function chargerFinances(c: Ctx, avecPaie: boolean) {
  const [tx, ventes, mouvements, factures, creancesFact, reglOuverts, reglPeriode, soldes, bulletins] = await Promise.all([
    db.$queryRaw<{ jour: string; type: string; methode: string | null; total: bigint }[]>`SELECT to_char("createdAt"::date, 'YYYY-MM-DD') AS jour, "type"::text AS type, "methode"::text AS methode, COALESCE(SUM("montant"), 0)::bigint AS total FROM "transactions" WHERE "etablissementId" = ${c.etabId} AND "createdAt" >= ${dd(c.precDebut)} AND "createdAt" < ${finExcl(c)} GROUP BY 1, 2, 3`,
    db.$queryRaw<{ jour: string; total: bigint }[]>`SELECT to_char("createdAt"::date, 'YYYY-MM-DD') AS jour, COALESCE(SUM("total"), 0)::bigint AS total FROM "ventes_comptoir" WHERE "etablissementId" = ${c.etabId} AND "statut" = 'PAYEE' AND "methode" IS NOT NULL AND "createdAt" >= ${dd(c.precDebut)} AND "createdAt" < ${finExcl(c)} GROUP BY 1`,
    db.mouvementStock.findMany({ where: { etablissementId: c.etabId, type: "SORTIE", consommationId: { not: null }, createdAt: { gte: dd(c.precDebut), lt: finExcl(c) } }, select: { createdAt: true, quantite: true, prix: true } }),
    db.facture.groupBy({ by: ["statut"], where: { etablissementId: c.etabId, statut: { in: ["ISSUED", "PAID", "CANCELLED"] }, emisLe: plageTs(c) }, _sum: { total: true }, _count: { _all: true } }),
    db.facture.aggregate({ where: { etablissementId: c.etabId, statut: "ISSUED" }, _sum: { total: true } }),
    db.reglement.aggregate({ where: { etablissementId: c.etabId, facture: { statut: "ISSUED" } }, _sum: { montant: true } }),
    db.reglement.groupBy({ by: ["methode"], where: { etablissementId: c.etabId, createdAt: plageTs(c) }, _sum: { montant: true } }),
    db.inscrit.aggregate({ where: { etablissementId: c.etabId }, _sum: { solde: true } }),
    avecPaie
      ? db.bulletinPaie.groupBy({ by: ["periode"], where: { etablissementId: c.etabId, periode: { gte: moisMoins(c.fin, 5) } }, _sum: { brut: true, net: true, coutEmployeur: true }, orderBy: { periode: "asc" } })
      : Promise.resolve([]),
  ])

  const repas = new Map<string, number>()
  const recharges = new Map<string, number>()
  const parMethode = new Map<string, number>()
  let repasPrec = 0
  for (const r of tx) {
    const t = num(r.total)
    const avant = r.jour < c.debut
    if (r.type === "DEBIT" || r.type === "REFUND") {
      if (avant) repasPrec -= t
      else repas.set(r.jour, (repas.get(r.jour) ?? 0) - t)
    } else if (r.type === "TOPUP" && !avant) {
      recharges.set(r.jour, (recharges.get(r.jour) ?? 0) + t)
      const m = r.methode ?? "AUTRE"
      parMethode.set(m, (parMethode.get(m) ?? 0) + t)
    }
  }
  const direct = new Map<string, number>()
  let directPrec = 0
  for (const v of ventes) {
    if (v.jour < c.debut) directPrec += num(v.total)
    else direct.set(v.jour, num(v.total))
  }
  const matieresJour = new Map<string, number>()
  let matieresPrec = 0
  for (const m of mouvements) {
    const val = Math.round(Math.abs(num(m.quantite)) * num(m.prix))
    const d = iso(m.createdAt)
    if (d < c.debut) matieresPrec += val
    else matieresJour.set(d, (matieresJour.get(d) ?? 0) + val)
  }

  const revenuSerie = c.jours.map((date) => ({ date, label: libelleJourCourt(date), repas: repas.get(date) ?? 0, direct: direct.get(date) ?? 0 }))
  const repasTotal = somme(revenuSerie.map((p) => p.repas))
  const directTotal = somme(revenuSerie.map((p) => p.direct))
  const ca = repasTotal + directTotal
  const caPrec = repasPrec + directPrec
  const matieres = somme([...matieresJour.values()])
  const servis = await db.consommation.aggregate({ where: { etablissementId: c.etabId, date: plageDates(c) }, _sum: { repas: true } })
  const nbRepas = num(servis._sum.repas)
  const creances = num(creancesFact._sum.total) - num(reglOuverts._sum.montant)
  const LIB_FACT: Record<string, string> = { ISSUED: "Émises", PAID: "Payées", CANCELLED: "Annulées" }

  const rechargesParMethode = [...parMethode.entries()].map(([methode, montant]) => ({ methode, label: LIBELLES_METHODE[methode] ?? methode, montant })).sort((a, b) => b.montant - a.montant)
  const tables: TableExport[] = [
    { nom: "revenus-journaliers", colonnes: ["Date", "Repas prélevés", "Ventes directes"], lignes: revenuSerie.map((p) => [p.date, p.repas, p.direct]) },
    { nom: "recharges-par-methode", colonnes: ["Méthode", "Montant"], lignes: rechargesParMethode.map((r) => [r.label, r.montant]) },
  ]
  return {
    kpi: {
      ca,
      caPrec,
      evolution: evolution(ca, caPrec),
      repasTotal,
      directTotal,
      parRepas: nbRepas > 0 ? Math.round(ca / nbRepas) : null,
      matieres,
      matieresEvolution: evolution(matieres, matieresPrec),
      margeBrute: ca - matieres,
      margePct: pourcent(ca - matieres, ca),
      creances: Math.max(0, creances),
      soldeComptes: num(soldes._sum.solde),
    },
    revenuSerie,
    rechargesSerie: serieQuotidienne(c.jours, recharges),
    rechargesParMethode,
    matieresSerie: serieQuotidienne(c.jours, matieresJour),
    sources: [
      { nom: "Repas prélevés sur les comptes", valeur: repasTotal },
      { nom: "Ventes directes (espèces, Mobile Money)", valeur: directTotal },
    ].filter((s) => s.valeur > 0),
    cascade: [
      { nom: "Recettes", valeur: ca, total: false },
      { nom: "Matières consommées", valeur: -matieres, total: false },
      { nom: "Marge brute", valeur: ca - matieres, total: true },
    ],
    facturesParStatut: factures.map((f) => ({ statut: f.statut as string, label: LIB_FACT[f.statut] ?? f.statut, total: num(f._sum.total), n: f._count._all })),
    reglementsParMethode: reglPeriode.map((r) => ({ methode: r.methode as string, label: LIBELLES_METHODE[r.methode] ?? r.methode, montant: num(r._sum.montant) })).sort((a, b) => b.montant - a.montant),
    paie: bulletins.map((b) => ({ periode: b.periode, label: libelleMois(b.periode), brut: num(b._sum.brut), net: num(b._sum.net), cout: num(b._sum.coutEmployeur) })),
    tables,
  }
}

// ---------------------------------------------------------------- Production et gaspillage
export async function chargerProduction(c: Ctx) {
  const [g, plans, conso, resService, servisService] = await Promise.all([
    chargerGaspillage(c.etabId, c.n),
    db.planProduction.findMany({ where: { etablissementId: c.etabId, date: plageDates(c) } }),
    db.consommation.findMany({ where: { etablissementId: c.etabId, date: plageDates(c) }, select: { date: true, service: true, repas: true } }),
    db.reservation.groupBy({ by: ["service"], where: { etablissementId: c.etabId, statut: "BOOKED", walkIn: false, date: plageDates(c) }, _count: { _all: true } }),
    db.reservation.groupBy({ by: ["service"], where: { etablissementId: c.etabId, statut: "BOOKED", walkIn: false, servedAt: { not: null }, date: plageDates(c) }, _count: { _all: true } }),
  ])
  const servisJour = new Map<string, number>()
  const servisParService = new Map<string, number>()
  for (const r of conso) {
    servisJour.set(iso(r.date), (servisJour.get(iso(r.date)) ?? 0) + r.repas)
    servisParService.set(r.service, (servisParService.get(r.service) ?? 0) + r.repas)
  }
  const prevus = new Map<string, number>()
  const produire = new Map<string, number>()
  const ecartService = new Map<string, number[]>()
  const reelCle = new Map(conso.map((r) => [iso(r.date) + "|" + r.service, r.repas]))
  for (const p of plans) {
    const d = iso(p.date)
    prevus.set(d, (prevus.get(d) ?? 0) + p.prevus)
    produire.set(d, (produire.get(d) ?? 0) + p.aProduire)
    const reel = reelCle.get(d + "|" + p.service)
    if (reel && reel > 0) ecartService.set(p.service, [...(ecartService.get(p.service) ?? []), Math.min(100, Math.round((Math.abs(p.prevus - reel) * 100) / reel))])
  }
  const prevuReel = c.jours
    .map((date) => ({ date, label: libelleJourCourt(date), prevus: prevus.get(date) ?? 0, aProduire: produire.get(date) ?? 0, servis: servisJour.get(date) ?? 0 }))
    .filter((p) => p.prevus > 0 || p.servis > 0)

  const servis = somme([...servisJour.values()])
  const coutParJour = new Map(g.serie.map((s) => [s.date, s.cout]))
  const portionsParService = new Map<string, number>()
  for (const r of g.rows) portionsParService.set(r.service, (portionsParService.get(r.service) ?? 0) + r.portions)
  const resMap = new Map(resService.map((r) => [r.service as string, r._count._all]))
  const srvMap = new Map(servisService.map((r) => [r.service as string, r._count._all]))
  const radar = ORDRE_SERVICES.filter((s) => (servisParService.get(s) ?? 0) > 0).map((s) => {
    const sv = servisParService.get(s) ?? 0
    const ecarts = ecartService.get(s) ?? []
    return {
      service: SERVICES[s],
      presence: Math.round(pourcent(srvMap.get(s) ?? 0, resMap.get(s) ?? 0) ?? 0),
      precision: ecarts.length ? Math.max(0, 100 - Math.round(moyenne(ecarts))) : 0,
      maitrise: Math.max(0, 100 - Math.round(pourcent(portionsParService.get(s) ?? 0, sv) ?? 0)),
    }
  })
  const classement = g.classement.map((x) => ({ nom: x.platNom, valeur: x.cout, portions: x.portions }))
  const tables: TableExport[] = [
    { nom: "gaspillage-par-plat", colonnes: ["Plat", "Portions", "Coût"], lignes: g.classement.map((x) => [x.platNom, x.portions, x.cout]) },
    { nom: "prevu-realise", colonnes: ["Date", "Prévus", "À produire", "Servis"], lignes: prevuReel.map((p) => [p.date, p.prevus, p.aProduire, p.servis]) },
  ]
  return {
    kpi: {
      cout: g.totalCout,
      portions: g.totalPortions,
      tauxGaspillage: pourcent(g.totalPortions, servis),
      coutParRepas: servis > 0 ? Math.round(g.totalCout / servis) : null,
      surplus: g.surplus,
      ecartMoyen: g.ecartMoyen,
      servis,
    },
    serieGaspillage: serieQuotidienne(c.jours, coutParJour),
    prevuReel,
    pareto: pareto(classement.map((x) => ({ nom: x.nom, valeur: x.valeur }))),
    parType: g.parType.map((t) => ({ type: t.type as string, label: TYPES_GASPILLAGE[t.type], cout: t.cout, portions: t.portions })),
    radar,
    tables,
  }
}

// ---------------------------------------------------------------- Stock et achats
export async function chargerStock(c: Ctx) {
  const [ingredients, mouvements, lignes, pertes] = await Promise.all([
    db.ingredient.findMany({ where: { etablissementId: c.etabId }, select: { id: true, name: true, unit: true, unitCost: true, stock: true, seuil: true } }),
    db.mouvementStock.findMany({ where: { etablissementId: c.etabId, type: "SORTIE", consommationId: { not: null }, createdAt: plageTs(c) }, select: { ingredientId: true, quantite: true, prix: true, createdAt: true } }),
    db.bonCommandeLigne.findMany({ where: { bon: { etablissementId: c.etabId, statut: { in: ["SENT", "PARTIAL", "RECEIVED"] }, createdAt: plageTs(c) } }, select: { quantite: true, prix: true, bon: { select: { fournisseur: { select: { name: true } } } } } }),
    db.mouvementStock.findMany({ where: { etablissementId: c.etabId, type: "PERTE", createdAt: plageTs(c) }, select: { quantite: true, prix: true } }),
  ])
  const valeurs = ingredients.map((i) => ({ nom: i.name, valeur: Math.round(num(i.stock) * num(i.unitCost)) }))
  const consoQte = new Map<string, number>()
  const consoJour = new Map<string, number>()
  for (const m of mouvements) {
    consoQte.set(m.ingredientId, (consoQte.get(m.ingredientId) ?? 0) + Math.abs(num(m.quantite)))
    const d = iso(m.createdAt)
    consoJour.set(d, (consoJour.get(d) ?? 0) + Math.round(Math.abs(num(m.quantite)) * num(m.prix)))
  }
  const alertes = ingredients
    .filter((i) => num(i.seuil) > 0 && num(i.stock) <= num(i.seuil))
    .map((i) => ({ nom: i.name, stock: num(i.stock), seuil: num(i.seuil), unite: i.unit }))
    .sort((a, b) => a.stock / a.seuil - b.stock / b.seuil)
  const couverture = ingredients
    .filter((i) => (consoQte.get(i.id) ?? 0) > 0)
    .map((i) => ({ nom: i.name, jours: Math.round((num(i.stock) / ((consoQte.get(i.id) ?? 1) / c.n)) * 10) / 10 }))
    .sort((a, b) => a.jours - b.jours)
    .slice(0, 10)
  const parFournisseur = new Map<string, number>()
  for (const l of lignes) {
    const nom = l.bon.fournisseur.name
    parFournisseur.set(nom, (parFournisseur.get(nom) ?? 0) + Math.round(num(l.quantite) * num(l.prix)))
  }
  const achats = [...parFournisseur.entries()].map(([nom, valeur]) => ({ nom, valeur })).sort((a, b) => b.valeur - a.valeur).slice(0, 10)
  const valeurStock = somme(valeurs.map((v) => v.valeur))
  const consommation = somme([...consoJour.values()])
  const tables: TableExport[] = [
    { nom: "stock-valeur", colonnes: ["Ingrédient", "Valeur du stock"], lignes: valeurs.sort((a, b) => b.valeur - a.valeur).map((v) => [v.nom, v.valeur]) },
    { nom: "alertes-stock", colonnes: ["Ingrédient", "Stock", "Seuil", "Unité"], lignes: alertes.map((a) => [a.nom, a.stock, a.seuil, a.unite]) },
  ]
  return {
    kpi: {
      valeurStock,
      alertes: alertes.length,
      consommation,
      achats: somme(achats.map((a) => a.valeur)),
      pertesValeur: somme(pertes.map((p) => Math.round(Math.abs(num(p.quantite)) * num(p.prix)))),
      pertesNb: pertes.length,
      rotationPct: valeurStock > 0 ? Math.round((consommation * 100) / valeurStock) : null,
    },
    treemap: valeurs.filter((v) => v.valeur > 0).sort((a, b) => b.valeur - a.valeur).slice(0, 12),
    alertes: alertes.slice(0, 15),
    couverture,
    consommationSerie: serieQuotidienne(c.jours, consoJour),
    achats,
    tables,
  }
}

// ---------------------------------------------------------------- Caisse
export async function chargerCaisse(c: Ctx) {
  const [ventes, prec, precRemb] = await Promise.all([
    db.venteComptoir.findMany({ where: { etablissementId: c.etabId, createdAt: plageTs(c) }, include: { lignes: true, remboursements: { select: { montant: true } } } }),
    db.venteComptoir.aggregate({ where: { etablissementId: c.etabId, statut: "PAYEE", createdAt: { gte: dd(c.precDebut), lt: dd(c.debut) } }, _sum: { total: true } }),
    db.venteRemboursement.aggregate({ where: { vente: { etablissementId: c.etabId, statut: "PAYEE", createdAt: { gte: dd(c.precDebut), lt: dd(c.debut) } } }, _sum: { montant: true } }),
  ])
  const payees = ventes.filter((v) => v.statut === "PAYEE")
  const annulees = ventes.length - payees.length
  const net = (v: (typeof payees)[number]): number => v.total - v.remboursements.reduce((s, r) => s + r.montant, 0)
  const ca = somme(payees.map(net))
  const jourCa = new Map<string, number>()
  const jourNb = new Map<string, number>()
  const heures = Array.from({ length: 24 }, (_, h) => ({ heure: String(h).padStart(2, "0") + "h", ventes: 0, montant: 0 }))
  const semaine = JOURS_SEMAINE.map((jour) => ({ jour, ventes: 0, montant: 0 }))
  const modes = new Map<string, number>()
  const articles = new Map<string, { quantite: number; montant: number }>()
  for (const v of payees) {
    const d = iso(v.createdAt)
    jourCa.set(d, (jourCa.get(d) ?? 0) + net(v))
    jourNb.set(d, (jourNb.get(d) ?? 0) + 1)
    heures[v.createdAt.getUTCHours()].ventes += 1
    heures[v.createdAt.getUTCHours()].montant += net(v)
    semaine[jourSemaine(d)].ventes += 1
    semaine[jourSemaine(d)].montant += net(v)
    const mode = v.methode ?? "COMPTE"
    modes.set(mode, (modes.get(mode) ?? 0) + net(v) - v.partCompte)
    if (v.partCompte > 0) modes.set("COMPTE", (modes.get("COMPTE") ?? 0) + v.partCompte)
    for (const l of v.lignes) {
      const a = articles.get(l.libelle) ?? { quantite: 0, montant: 0 }
      a.quantite += l.quantite
      a.montant += l.montant
      articles.set(l.libelle, a)
    }
  }
  const topArticles = [...articles.entries()].map(([nom, a]) => ({ nom, ...a })).sort((a, b) => b.montant - a.montant).slice(0, 10)
  const parMode = [...modes.entries()].map(([mode, montant]) => ({ mode, label: LIBELLES_METHODE[mode] ?? mode, montant })).sort((a, b) => b.montant - a.montant)
  const serie = c.jours.map((date) => ({ date, label: libelleJourCourt(date), ca: jourCa.get(date) ?? 0, tickets: jourNb.get(date) ?? 0 }))
  const tables: TableExport[] = [
    { nom: "caisse-journaliere", colonnes: ["Date", "Chiffre d'affaires", "Tickets"], lignes: serie.map((p) => [p.date, p.ca, p.tickets]) },
    { nom: "caisse-articles", colonnes: ["Article", "Quantité", "Montant"], lignes: topArticles.map((a) => [a.nom, a.quantite, a.montant]) },
  ]
  return {
    kpi: {
      ca,
      evolution: evolution(ca, num(prec._sum.total) - num(precRemb._sum.montant)),
      tickets: payees.length,
      ticketMoyen: payees.length ? Math.round(ca / payees.length) : null,
      articlesParTicket: payees.length ? Math.round((somme(payees.flatMap((v) => v.lignes.map((l) => l.quantite))) * 10) / payees.length) / 10 : null,
      annulees,
      tauxAnnulation: pourcent(annulees, ventes.length),
    },
    serie,
    heures,
    semaine,
    parMode,
    topArticles,
    tables,
  }
}

// ---------------------------------------------------------------- Inscrits
export async function chargerInscrits(c: Ctx) {
  const [parType, parStatut, inscrits, assidus] = await Promise.all([
    db.inscrit.groupBy({ by: ["type"], where: { etablissementId: c.etabId }, _count: { _all: true } }),
    db.inscrit.groupBy({ by: ["statut"], where: { etablissementId: c.etabId }, _count: { _all: true } }),
    db.inscrit.findMany({ where: { etablissementId: c.etabId }, select: { solde: true, createdAt: true } }),
    db.reservation.groupBy({ by: ["inscritId"], where: { etablissementId: c.etabId, servedAt: { not: null }, date: plageDates(c) }, _count: { _all: true }, orderBy: { _count: { inscritId: "desc" } }, take: 10 }),
  ])
  const noms = assidus.length ? await db.inscrit.findMany({ where: { etablissementId: c.etabId, id: { in: assidus.map((a) => a.inscritId) } }, select: { id: true, matricule: true, firstName: true, lastName: true } }) : []
  const parId = new Map(noms.map((n) => [n.id, n]))
  const soldes = inscrits.map((i) => i.solde)
  const mois = Array.from({ length: 6 }, (_, k) => moisMoins(c.fin, 5 - k))
  const croissance = mois.map((m) => ({ periode: m, label: libelleMois(m), total: inscrits.filter((i) => iso(i.createdAt).slice(0, 7) <= m).length }))
  const assiduite = assidus.map((a) => {
    const i = parId.get(a.inscritId)
    return { nom: i ? `${i.firstName} ${i.lastName}` : "Inscrit", matricule: i?.matricule ?? "", repas: a._count._all }
  })
  const tables: TableExport[] = [
    { nom: "inscrits-par-type", colonnes: ["Type", "Effectif"], lignes: parType.map((t) => [t.type as string, t._count._all]) },
    { nom: "inscrits-assiduite", colonnes: ["Matricule", "Nom", "Repas servis"], lignes: assiduite.map((a) => [a.matricule, a.nom, a.repas]) },
  ]
  return {
    kpi: { total: inscrits.length, soldeTotal: somme(soldes), soldesNegatifs: soldes.filter((s) => s < 0).length, soldesNuls: soldes.filter((s) => s === 0).length },
    parType: parType.map((t) => ({ nom: t.type as string, valeur: t._count._all })),
    parStatut: parStatut.map((s) => ({ nom: s.statut as string, valeur: s._count._all })),
    tranchesSolde: tranches(soldes, [0, 1000, 5000, 10000, 25000]),
    croissance,
    assiduite,
    tables,
  }
}

export type DonneesApercu = {
  frequentation: Awaited<ReturnType<typeof chargerFrequentation>>
  finances: Awaited<ReturnType<typeof chargerFinances>> | null
  production: Awaited<ReturnType<typeof chargerProduction>>
  stock: Awaited<ReturnType<typeof chargerStock>>
}
export type SerieSpark = PointJour[]