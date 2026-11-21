import "server-only"

import { db } from "@/lib/db"
import { ORDRE_SERVICES, SERVICES, ajouterJours, analysePlat, aujourdhui, libelleCourt, versDate, versIso, type ServiceMenu } from "@/lib/menus"

export const PERIODES = {
  jour: { libelle: "Aujourd'hui", jours: 1 },
  "7j": { libelle: "7 derniers jours", jours: 7 },
  "30j": { libelle: "30 derniers jours", jours: 30 },
} as const
export type PeriodeCle = keyof typeof PERIODES
export const periodeValide = (v: string): v is PeriodeCle => Object.hasOwn(PERIODES, v)
export const OBJECTIF_PRESENCE = 90
const CRENEAUX_SEMAINE = 28

export const variation = (actuel: number, precedent: number): number | null => (precedent === 0 ? (actuel === 0 ? 0 : null) : Math.round(((actuel - precedent) * 100) / precedent))
export const libelleJourMois = (iso: string): string => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(versDate(iso))
const libelleMois = (iso: string): string => new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(versDate(iso))

// Cumuls par jour et par service sur la periode demandee, la periode precedente, le mois en cours et l'issue des reservations.
export async function chargerTableauBord(etabId: string, periode: PeriodeCle, avecCout: boolean) {
  const n = PERIODES[periode].jours
  const fin = aujourdhui()
  const debut = ajouterJours(fin, -(n - 1))
  const debutPrec = ajouterJours(debut, -n)
  const finPrec = ajouterJours(debut, -1)
  const nbGraph = Math.max(n, 7)
  const debutGraph = ajouterJours(fin, -(nbGraph - 1))
  const nbIssue = Math.max(n, 14)
  const debutIssue = ajouterJours(fin, -(nbIssue - 1))
  const finIssue = ajouterJours(fin, 3)
  const depart = [debutPrec, debutGraph, debutIssue].sort()[0]
  const plage = { gte: versDate(depart), lte: versDate(finIssue) }
  const plagePeriode = { gte: versDate(debut), lte: versDate(fin) }
  const plageIssue = { gte: versDate(debutIssue), lte: versDate(finIssue) }
  const moisDebut = fin.slice(0, 8) + "01"
  const moisFin = versIso(new Date(Date.UTC(Number(fin.slice(0, 4)), Number(fin.slice(5, 7)), 0)))
  const base = { etablissementId: etabId, statut: "BOOKED" as const }

  const [lignesRes, lignesServ, annulees, inscrits, horsReservation, horsIssue, groupes, menusAVenir, allergiesAujourdhui, reservesMois, reservesPassees, servisMois, menusCout] = await Promise.all([
    db.reservation.groupBy({ by: ["date", "service"], where: { ...base, date: plage }, _count: { _all: true } }),
    db.reservation.groupBy({ by: ["date", "service"], where: { ...base, servedAt: { not: null }, date: plage }, _count: { _all: true } }),
    db.reservation.groupBy({ by: ["date"], where: { etablissementId: etabId, statut: "CANCELLED", date: plageIssue }, _count: { _all: true } }),
    db.inscrit.count({ where: { etablissementId: etabId, statut: "ACTIVE" } }),
    db.reservation.count({ where: { ...base, walkIn: true, servedAt: { not: null }, date: plagePeriode } }),
    db.reservation.count({ where: { ...base, walkIn: true, servedAt: { not: null }, date: { gte: versDate(debutIssue), lte: versDate(fin) } } }),
    db.referentiel.findMany({ where: { etablissementId: etabId, kind: "GROUPE" }, select: { id: true, name: true }, take: 50 }),
    db.menu.findMany({ where: { etablissementId: etabId, date: { gte: versDate(fin), lte: versDate(ajouterJours(fin, 6)) } }, select: { date: true, service: true, statut: true } }),
    db.reservation.count({ where: { ...base, date: versDate(fin), inscrit: { allergies: { some: {} } } } }),
    db.reservation.count({ where: { ...base, date: { gte: versDate(moisDebut), lte: versDate(moisFin) } } }),
    db.reservation.count({ where: { ...base, date: { gte: versDate(moisDebut), lte: versDate(fin) } } }),
    db.reservation.count({ where: { ...base, servedAt: { not: null }, date: { gte: versDate(moisDebut), lte: versDate(moisFin) } } }),
    avecCout
      ? db.menu.findMany({
          where: { etablissementId: etabId, date: { gte: versDate(debutPrec), lte: versDate(fin) } },
          include: { plats: { include: { plat: { include: { ingredients: { include: { ingredient: { include: { allergens: { include: { allergie: true } } } } } } } } } } },
        })
      : Promise.resolve([]),
  ])

  const cle = (d: Date, s: string) => versIso(d) + "_" + s
  const res = new Map<string, number>()
  const serv = new Map<string, number>()
  const annul = new Map<string, number>()
  for (const l of lignesRes) res.set(cle(l.date, l.service), l._count._all)
  for (const l of lignesServ) serv.set(cle(l.date, l.service), l._count._all)
  for (const l of annulees) annul.set(versIso(l.date), l._count._all)
  const somme = (m: Map<string, number>, de: string, a: string, service?: string): number => {
    let t = 0
    for (const [k, v] of m) {
      const [j, s] = k.split("_")
      if (j >= de && j <= a && (!service || s === service)) t += v
    }
    return t
  }
  const taux = (s: number, r: number): number | null => (r > 0 ? Math.round((s * 100) / r) : null)

  const coutConvive = new Map<string, number>()
  for (const m of menusCout) coutConvive.set(cle(m.date, m.service), m.plats.reduce((t, mp) => t + analysePlat(mp.plat).coutPortion, 0))
  const coutSur = (de: string, a: string): number => {
    let t = 0
    for (const [k, v] of serv) {
      const [j] = k.split("_")
      if (j >= de && j <= a) t += v * (coutConvive.get(k) ?? 0)
    }
    return t
  }

  const servis = somme(serv, debut, fin)
  const servisPrec = somme(serv, debutPrec, finPrec)
  const reserves = somme(res, debut, fin)
  const reservesPrec = somme(res, debutPrec, finPrec)
  const cout = Math.round(coutSur(debut, fin))

  const serie = Array.from({ length: nbGraph }, (_, i) => {
    const jour = ajouterJours(debutGraph, i)
    return { jour, label: libelleCourt(jour), reserves: somme(res, jour, jour), servis: somme(serv, jour, jour) }
  })
  const services = ORDRE_SERVICES.map((s: ServiceMenu) => {
    const r = somme(res, debut, fin, s)
    const sv = somme(serv, debut, fin, s)
    return { service: s, label: SERVICES[s], reserves: r, servis: sv, taux: taux(sv, r) }
  })

  // Issue des reservations : servi, annule, absent (jour passe) ou a venir (aujourd'hui et apres).
  const serieIssue = Array.from({ length: nbIssue + 3 }, (_, i) => {
    const jour = ajouterJours(debutIssue, i)
    const reserve = somme(res, jour, jour)
    const servi = somme(serv, jour, jour)
    const restant = reserve - servi
    return { jour, label: libelleJourMois(jour), servis: servi, annulees: annul.get(jour) ?? 0, absents: jour < fin ? restant : 0, avenir: jour >= fin ? restant : 0 }
  })
  const totalIssue = serieIssue.reduce(
    (t, p) => ({ servis: t.servis + p.servis, annulees: t.annulees + p.annulees, absents: t.absents + p.absents, avenir: t.avenir + p.avenir }),
    { servis: 0, annulees: 0, absents: 0, avenir: 0 },
  )
  const issue = { serie: serieIssue, ...totalIssue, places: totalIssue.servis + totalIssue.annulees + totalIssue.absents + totalIssue.avenir, horsReservation: horsIssue, debut: debutIssue, fin: finIssue }

  // Mois en cours : reserves attendus, servis et prevision (servis + reserves a venir x taux de presence deja observe).
  const tauxPasse = reservesPassees > 0 ? servisMois / reservesPassees : OBJECTIF_PRESENCE / 100
  const mois = {
    libelle: libelleMois(fin),
    cible: reservesMois,
    servis: servisMois,
    prevision: Math.round(servisMois + (reservesMois - reservesPassees) * tauxPasse),
  }

  const menuAujourdhui = new Map(menusAVenir.filter((m) => versIso(m.date) === fin).map((m) => [m.service as string, m.statut]))
  const aujourdhuiServices = ORDRE_SERVICES.map((s: ServiceMenu) => ({
    service: s,
    label: SERVICES[s],
    menu: menuAujourdhui.get(s) ?? null,
    reserves: somme(res, fin, fin, s),
    servis: somme(serv, fin, fin, s),
  }))

  const classementGroupes = (
    await Promise.all(
      groupes.map(async (g) => ({
        nom: g.name,
        servis: await db.reservation.count({ where: { ...base, servedAt: { not: null }, date: plagePeriode, inscrit: { groupeId: g.id } } }),
      })),
    )
  )
    .filter((g) => g.servis > 0)
    .sort((a, b) => b.servis - a.servis)
    .slice(0, 5)

  const publies = menusAVenir.filter((m) => m.statut === "PUBLISHED").length
  const brouillons = menusAVenir.filter((m) => m.statut === "DRAFT").length
  const meilleur = [...services].sort((a, b) => b.servis - a.servis)[0]

  return {
    periode,
    debut,
    fin,
    kpi: {
      servis,
      servisVariation: variation(servis, servisPrec),
      reserves,
      taux: taux(servis, reserves),
      tauxPrec: taux(servisPrec, reservesPrec),
      inscrits,
      horsReservation,
      cout,
      coutVariation: variation(cout, Math.round(coutSur(debutPrec, finPrec))),
    },
    serie,
    services,
    issue,
    mois,
    aujourdhui: aujourdhuiServices,
    groupes: classementGroupes,
    menus: { publies, brouillons, manquants: CRENEAUX_SEMAINE - publies, total: CRENEAUX_SEMAINE },
    allergiesAujourdhui,
    meilleurService: meilleur && meilleur.servis > 0 ? meilleur : null,
  }
}