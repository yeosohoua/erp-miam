import "server-only"

import { aideActiveLe, prixApresAides, type AideCalcul, type TypeAideCle } from "@/lib/aides-base"
import { db } from "@/lib/db"

export const jourIso = (): string => new Date().toISOString().slice(0, 10)
export const versDate = (iso: string): Date => new Date(iso + "T00:00:00.000Z")
const iso = (d: Date): string => d.toISOString().slice(0, 10)

// Aides qui s'appliquent a un inscrit a une date donnee (utilisee au moment du debit).
export async function aidesActivesPour(etabId: string, inscritId: string, dateIso: string): Promise<AideCalcul[]> {
  const d = versDate(dateIso)
  const rows = await db.aideInscrit.findMany({
    where: { etablissementId: etabId, inscritId, debut: { lte: d }, OR: [{ fin: null }, { fin: { gte: d } }], aide: { active: true } },
    select: { aide: { select: { id: true, nom: true, type: true, valeur: true } } },
  })
  return rows.map((r) => ({ id: r.aide.id, nom: r.aide.nom, type: r.aide.type as TypeAideCle, valeur: r.aide.valeur }))
}

export type LigneAide = { id: string; nom: string; type: TypeAideCle; valeur: number; description: string | null; active: boolean; beneficiaires: number }

export async function chargerAides(etabId: string): Promise<LigneAide[]> {
  const aujourdhui = versDate(jourIso())
  const [aides, comptes] = await Promise.all([
    db.aide.findMany({ where: { etablissementId: etabId }, orderBy: { nom: "asc" } }),
    db.aideInscrit.groupBy({ by: ["aideId"], where: { etablissementId: etabId, debut: { lte: aujourdhui }, OR: [{ fin: null }, { fin: { gte: aujourdhui } }] }, _count: { _all: true } }),
  ])
  const n = new Map(comptes.map((c) => [c.aideId, c._count._all]))
  return aides.map((a) => ({ id: a.id, nom: a.nom, type: a.type as TypeAideCle, valeur: a.valeur, description: a.description, active: a.active, beneficiaires: n.get(a.id) ?? 0 }))
}

export type LigneAttribution = { id: string; matricule: string; nom: string; aideNom: string; type: TypeAideCle; valeur: number; debut: string; fin: string | null; motif: string | null; active: boolean }

export async function chargerAttributions(etabId: string): Promise<LigneAttribution[]> {
  const rows = await db.aideInscrit.findMany({
    where: { etablissementId: etabId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { inscrit: { select: { matricule: true, firstName: true, lastName: true } }, aide: { select: { nom: true, type: true, valeur: true, active: true } } },
  })
  const auj = jourIso()
  return rows.map((r) => {
    const debut = iso(r.debut)
    const fin = r.fin ? iso(r.fin) : null
    return { id: r.id, matricule: r.inscrit.matricule, nom: `${r.inscrit.lastName} ${r.inscrit.firstName}`, aideNom: r.aide.nom, type: r.aide.type as TypeAideCle, valeur: r.aide.valeur, debut, fin, motif: r.motif, active: r.aide.active && aideActiveLe(debut, fin, auj) }
  })
}

export async function chargerSynthese(etabId: string) {
  const auj = jourIso()
  const d0 = versDate(auj)
  const actives = await db.aideInscrit.findMany({
    where: { etablissementId: etabId, debut: { lte: d0 }, OR: [{ fin: null }, { fin: { gte: d0 } }], aide: { active: true } },
    select: { inscritId: true, aide: { select: { id: true, nom: true, type: true, valeur: true } } },
  })
  const parInscrit = new Map<string, AideCalcul[]>()
  for (const a of actives) {
    const l = parInscrit.get(a.inscritId) ?? []
    l.push({ id: a.aide.id, nom: a.aide.nom, type: a.aide.type as TypeAideCle, valeur: a.aide.valeur })
    parInscrit.set(a.inscritId, l)
  }
  const totalInscrits = await db.inscrit.count({ where: { etablissementId: etabId, statut: "ACTIVE" } })
  const tarifs = await db.tarif.findMany({ where: { etablissementId: etabId } })
  const prix = new Map(tarifs.map((t) => [t.service, t.prix]))
  const debut30 = versDate(iso(new Date(Date.now() - 30 * 864e5)))
  const servis = parInscrit.size
    ? await db.reservation.groupBy({ by: ["inscritId", "service"], where: { etablissementId: etabId, inscritId: { in: [...parInscrit.keys()] }, statut: "BOOKED", servedAt: { not: null }, date: { gte: debut30, lte: d0 } }, _count: { _all: true } })
    : []
  let cout = 0
  let repas = 0
  for (const s of servis) {
    const r = prixApresAides(prix.get(s.service) ?? 0, parInscrit.get(s.inscritId) ?? [])
    cout += r.reduction * s._count._all
    repas += s._count._all
  }
  return { beneficiaires: parInscrit.size, totalInscrits, tauxPct: totalInscrits ? Math.round((parInscrit.size * 1000) / totalInscrits) / 10 : null, coutEstime: cout, repasAides: repas }
}