import "server-only"

import { db } from "@/lib/db"
import { ORDRE_SERVICES, ajouterJours, aujourdhui, versDate, versIso, type ServiceMenu } from "@/lib/menus"
import {
  MARGE_DEFAUT,
  aCommander,
  aProduireRecommande,
  besoinsIngredients,
  ecartPct,
  prevoir,
  type Evenement,
  type JourHistorique,
  type PlatRecette,
  type Prevision,
  type TypeEvenement,
  type TypeGaspillage,
} from "@/lib/prevision-base"

const HISTORIQUE_JOURS = 120
const cle = (date: string, service: string): string => date + "|" + service

export type LignePrevision = {
  date: string
  service: ServiceMenu
  prevision: Prevision
  plan: { prevus: number; aProduire: number } | null
  recommande: number | null
  plats: { id: string; nom: string }[]
  recettes: PlatRecette[]
}

export type EvenementVue = Evenement & { id: string }

// Previsions des creneaux (menu, reservation ou plan) d'une periode, a partir de l'historique des repas servis.
export async function calculerPrevisions(etabId: string, debut: string, nb: number) {
  const fin = ajouterJours(debut, nb - 1)
  const depart = ajouterJours(debut, -HISTORIQUE_JOURS)
  const [menus, reservations, consommations, evenementsDb, plans] = await Promise.all([
    db.menu.findMany({
      where: { etablissementId: etabId, date: { gte: versDate(debut), lte: versDate(fin) } },
      include: { plats: { include: { plat: { include: { ingredients: true } } } } },
    }),
    db.reservation.groupBy({
      by: ["date", "service"],
      where: { etablissementId: etabId, statut: "BOOKED", date: { gte: versDate(depart), lte: versDate(fin) } },
      _count: { _all: true },
    }),
    db.consommation.findMany({
      where: { etablissementId: etabId, date: { gte: versDate(depart), lt: versDate(fin) } },
      select: { date: true, service: true, repas: true },
    }),
    db.evenementCantine.findMany({
      where: { etablissementId: etabId, fin: { gte: versDate(depart) }, debut: { lte: versDate(fin) } },
      orderBy: { debut: "asc" },
    }),
    db.planProduction.findMany({ where: { etablissementId: etabId, date: { gte: versDate(debut), lte: versDate(fin) } } }),
  ])

  const reservesParCle = new Map<string, number>()
  for (const r of reservations) reservesParCle.set(cle(versIso(r.date), r.service), r._count._all)

  const evenements: EvenementVue[] = evenementsDb.map((e) => ({
    id: e.id,
    type: e.type as TypeEvenement,
    debut: versIso(e.debut),
    fin: versIso(e.fin),
    impactPct: e.impactPct,
    libelle: e.libelle,
  }))

  const historiqueParService = new Map<string, JourHistorique[]>()
  for (const c of consommations) {
    const d = versIso(c.date)
    const liste = historiqueParService.get(c.service) ?? []
    liste.push({ date: d, servis: c.repas, reserves: reservesParCle.get(cle(d, c.service)) ?? 0 })
    historiqueParService.set(c.service, liste)
  }

  const planParCle = new Map(plans.map((p) => [cle(versIso(p.date), p.service), p]))
  const menuParCle = new Map(menus.map((m) => [cle(versIso(m.date), m.service), m]))
  const creneaux = new Set<string>()
  for (const k of menuParCle.keys()) creneaux.add(k)
  for (const k of planParCle.keys()) creneaux.add(k)
  for (const k of reservesParCle.keys()) if (k.slice(0, 10) >= debut && k.slice(0, 10) <= fin) creneaux.add(k)

  const aujourdhuiIso = aujourdhui()
  const lignes: LignePrevision[] = [...creneaux]
    .map((k) => ({ date: k.slice(0, 10), service: k.slice(11) as ServiceMenu }))
    .sort((a, b) => (a.date === b.date ? ORDRE_SERVICES.indexOf(a.service) - ORDRE_SERVICES.indexOf(b.service) : a.date < b.date ? -1 : 1))
    .map(({ date, service }) => {
      const prevision = prevoir({
        cible: date,
        aujourdhui: aujourdhuiIso,
        historique: historiqueParService.get(service) ?? [],
        reserves: reservesParCle.get(cle(date, service)) ?? 0,
        evenements,
      })
      const plan = planParCle.get(cle(date, service))
      const menu = menuParCle.get(cle(date, service))
      const plats = (menu?.plats ?? []).map((mp) => mp.plat)
      return {
        date,
        service,
        prevision,
        plan: plan ? { prevus: plan.prevus, aProduire: plan.aProduire } : null,
        recommande: prevision.prevu === null ? null : aProduireRecommande(prevision.prevu, MARGE_DEFAUT),
        plats: plats.map((p) => ({ id: p.id, nom: p.name })),
        recettes: plats.map((p) => ({
          portions: p.portions,
          lignes: p.ingredients.map((l) => ({ ingredientId: l.ingredientId, quantite: Number(l.quantity) })),
        })),
      }
    })

  return { debut, fin, lignes, evenements }
}

export type LigneCommandeVue = {
  ingredientId: string
  nom: string
  unite: string
  besoin: number
  stock: number
  enCommande: number
  securite: number
  manque: number
  unitCost: number
  coutManque: number
}

// Quantites a commander pour couvrir les repas prevus (ou le plan fixe) des prochains jours.
export async function chargerCommande(etabId: string, jours: number) {
  const { lignes } = await calculerPrevisions(etabId, aujourdhui(), jours)
  const besoins = new Map<string, number>()
  let repas = 0
  for (const l of lignes) {
    const n = l.plan ? l.plan.aProduire : (l.recommande ?? 0)
    if (n <= 0 || l.recettes.length === 0) continue
    repas += n
    for (const [id, q] of besoinsIngredients(l.recettes, n)) besoins.set(id, (besoins.get(id) ?? 0) + q)
  }
  const ids = [...besoins.keys()]
  const [ingredients, engages] = ids.length
    ? await Promise.all([
        db.ingredient.findMany({ where: { etablissementId: etabId, id: { in: ids } } }),
        db.bonCommandeLigne.findMany({
          where: { ingredientId: { in: ids }, bon: { etablissementId: etabId, statut: { in: ["SENT", "PARTIAL"] } } },
          select: { ingredientId: true, quantite: true, recue: true },
        }),
      ])
    : [[], []]

  const stock = new Map(ingredients.map((i) => [i.id, Number(i.stock)]))
  const seuil = new Map(ingredients.map((i) => [i.id, Number(i.seuil)]))
  const enCommande = new Map<string, number>()
  for (const e of engages) enCommande.set(e.ingredientId, (enCommande.get(e.ingredientId) ?? 0) + Math.max(0, Number(e.quantite) - Number(e.recue)))
  const infos = new Map(ingredients.map((i) => [i.id, i]))

  const vue: LigneCommandeVue[] = aCommander({ besoins, stock, seuil, enCommande })
    .filter((l) => infos.has(l.ingredientId) && l.besoin > 0)
    .map((l) => {
      const i = infos.get(l.ingredientId)!
      const unitCost = Number(i.unitCost)
      return { ...l, nom: i.name, unite: i.unit, unitCost, coutManque: Math.round(l.manque * unitCost) }
    })
    .sort((a, b) => b.manque - a.manque || a.nom.localeCompare(b.nom, "fr"))

  return { jours, repas, lignes: vue, total: vue.reduce((t, l) => t + l.coutManque, 0), aCommander: vue.filter((l) => l.manque > 0).length }
}

// Restes et gaspillage sur une periode, avec precision des previsions passees.
export async function chargerGaspillage(etabId: string, jours: number) {
  const fin = aujourdhui()
  const debut = ajouterJours(fin, -(jours - 1))
  const intervalle = { gte: versDate(debut), lte: versDate(fin) }
  const [rows, plans, consommations] = await Promise.all([
    db.gaspillage.findMany({ where: { etablissementId: etabId, date: intervalle }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    db.planProduction.findMany({ where: { etablissementId: etabId, date: intervalle } }),
    db.consommation.findMany({ where: { etablissementId: etabId, date: intervalle } }),
  ])

  const liste = rows.map((r) => ({
    id: r.id,
    date: versIso(r.date),
    service: r.service as ServiceMenu,
    platNom: r.platNom,
    portions: r.portions,
    coutPortion: r.coutPortion,
    cout: r.cout,
    type: r.type as TypeGaspillage,
    note: r.note,
  }))

  const parPlat = new Map<string, { platNom: string; portions: number; cout: number }>()
  const parType = new Map<TypeGaspillage, { portions: number; cout: number }>()
  const parJour = new Map<string, { date: string; portions: number; cout: number }>()
  for (const r of liste) {
    const p = parPlat.get(r.platNom) ?? { platNom: r.platNom, portions: 0, cout: 0 }
    p.portions += r.portions
    p.cout += r.cout
    parPlat.set(r.platNom, p)
    const t = parType.get(r.type) ?? { portions: 0, cout: 0 }
    t.portions += r.portions
    t.cout += r.cout
    parType.set(r.type, t)
    const j = parJour.get(r.date) ?? { date: r.date, portions: 0, cout: 0 }
    j.portions += r.portions
    j.cout += r.cout
    parJour.set(r.date, j)
  }

  const servis = new Map(consommations.map((c) => [cle(versIso(c.date), c.service), c.repas]))
  let surplus = 0
  const ecarts: number[] = []
  for (const p of plans) {
    const reel = servis.get(cle(versIso(p.date), p.service))
    if (reel === undefined) continue
    surplus += Math.max(0, p.aProduire - reel)
    const e = ecartPct(p.prevus, reel)
    if (e !== null) ecarts.push(e)
  }

  return {
    debut,
    fin,
    jours,
    rows: liste,
    totalCout: liste.reduce((t, r) => t + r.cout, 0),
    totalPortions: liste.reduce((t, r) => t + r.portions, 0),
    classement: [...parPlat.values()].sort((a, b) => b.cout - a.cout).slice(0, 10),
    parType: [...parType.entries()].map(([type, v]) => ({ type, ...v })),
    serie: [...parJour.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    surplus,
    ecartMoyen: ecarts.length ? Math.round(ecarts.reduce((t, e) => t + e, 0) / ecarts.length) : null,
  }
}