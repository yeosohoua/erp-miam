import "server-only"

import type { Prisma } from "@/generated/prisma/client"
import { PLAN, ajusterDate, moisSuivant, tresorerie, type Journal } from "@/lib/compta-base"
import { db } from "@/lib/db"
import { libellePeriode, numeroAffiche } from "@/lib/facturation-base"
import { versDate } from "@/lib/menus"
import { numeroTicket } from "@/lib/caisse-base"

type Client = Prisma.TransactionClient

// Erreur "metier" : fait annuler la transaction, son message est affichable.
export class ErreurCompta extends Error {}

export type LigneEcr = { compte: string; debit: number; credit: number }
export type Poste = { journal: Journal; date: string; piece?: string | null; libelle: string; sourceType?: string | null; sourceId?: string | null; lignes: LigneEcr[] }
export type Prevu = Poste & { sourceType: string; sourceId: string }
export type Contexte = { etabId: string; userEmail: string; suivant: number; derniere: string | null }

const D = (compte: string, montant: number): LigneEcr => ({ compte, debit: montant, credit: 0 })
const C = (compte: string, montant: number): LigneEcr => ({ compte, debit: 0, credit: montant })
const jourIso = (d: Date): string => d.toISOString().slice(0, 10)
const valeurStock = (quantite: unknown, prix: unknown): number => Math.round(Math.abs(Number(quantite)) * Number(prix ?? 0))

// Calcule, sans rien ecrire, les ecritures des pieces sources pas encore comptabilisees.
export async function planifier(c: Client, etabId: string): Promise<Prevu[]> {
  const existants = new Set((await c.ecritureCompta.findMany({ where: { etablissementId: etabId, sourceType: { not: null } }, select: { sourceType: true, sourceId: true } })).map((e) => e.sourceType + ":" + e.sourceId))
  const deja = (type: string, id: string): boolean => existants.has(type + ":" + id)
  const prevus: Prevu[] = []

  // Factures emises : creance client et produit. Une facture annulee est contrepassee.
  const factures = await c.facture.findMany({
    where: { etablissementId: etabId, statut: { in: ["ISSUED", "PAID", "CANCELLED"] }, numero: { not: null }, emisLe: { not: null } },
    include: { client: { select: { name: true } } },
    orderBy: { numero: "asc" },
  })
  for (const f of factures) {
    const piece = numeroAffiche(f.numero)
    const dateEmission = jourIso(f.emisLe as Date)
    if (!deja("FACT", f.id)) {
      prevus.push({ journal: "VE", date: dateEmission, piece, libelle: "Facture " + piece + " — " + f.client.name, sourceType: "FACT", sourceId: f.id, lignes: [D("411", f.total), C("706", f.total)] })
    }
    if (f.statut === "CANCELLED" && !deja("FACT_ANNUL", f.id)) {
      const dateAnnulation = jourIso(f.updatedAt)
      prevus.push({
        journal: "VE",
        date: dateAnnulation > dateEmission ? dateAnnulation : dateEmission,
        piece,
        libelle: "Annulation de la facture " + piece + " — " + f.client.name,
        sourceType: "FACT_ANNUL",
        sourceId: f.id,
        lignes: [D("706", f.total), C("411", f.total)],
      })
    }
  }

  // Reglements de factures : tresorerie contre creance client.
  const reglements = await c.reglement.findMany({ where: { etablissementId: etabId }, include: { facture: { select: { numero: true } } }, orderBy: { createdAt: "asc" } })
  for (const r of reglements) {
    if (deja("REGL", r.id) || r.montant <= 0) continue
    const t = tresorerie(r.methode)
    const piece = numeroAffiche(r.facture.numero)
    prevus.push({ journal: t.journal, date: jourIso(r.createdAt), piece: r.reference ?? piece, libelle: "Règlement de la facture " + piece + " (" + r.methode + ")", sourceType: "REGL", sourceId: r.id, lignes: [D(t.compte, r.montant), C("411", r.montant)] })
  }

  // Comptes prepayes : recharges (avance recue) et ajustements manuels.
  const operations = await c.transaction.findMany({ where: { etablissementId: etabId, type: { in: ["TOPUP", "ADJUST"] } }, include: { inscrit: { select: { matricule: true } } }, orderBy: { createdAt: "asc" } })
  for (const t of operations) {
    if (deja("TX", t.id) || t.montant === 0) continue
    const jour = jourIso(t.createdAt)
    if (t.type === "TOPUP") {
      if (t.montant < 0) continue
      const tr = tresorerie(t.methode)
      prevus.push({ journal: tr.journal, date: jour, piece: t.reference, libelle: "Recharge du compte " + t.inscrit.matricule + (t.methode ? " (" + t.methode + ")" : ""), sourceType: "TX", sourceId: t.id, lignes: [D(tr.compte, t.montant), C("4191", t.montant)] })
    } else if (t.montant > 0) {
      prevus.push({ journal: "OD", date: jour, piece: t.reference, libelle: "Ajustement de solde (crédit) " + t.inscrit.matricule + (t.note ? " : " + t.note : ""), sourceType: "TX", sourceId: t.id, lignes: [D("658", t.montant), C("4191", t.montant)] })
    } else {
      prevus.push({ journal: "OD", date: jour, piece: t.reference, libelle: "Ajustement de solde (débit) " + t.inscrit.matricule + (t.note ? " : " + t.note : ""), sourceType: "TX", sourceId: t.id, lignes: [D("4191", -t.montant), C("758", -t.montant)] })
    }
  }

  // Repas servis : le produit est reconnu au service. Une ecriture par jour et par passage, sur la difference deja comptabilisee.
  const jours = await c.$queryRaw<{ jour: string; net: bigint }[]>`SELECT to_char("createdAt"::date, 'YYYY-MM-DD') AS jour, COALESCE(SUM("montant"), 0)::bigint AS net FROM "transactions" WHERE "etablissementId" = ${etabId} AND "type" IN ('DEBIT', 'REFUND') GROUP BY 1 ORDER BY 1`
  if (jours.length > 0) {
    const postes = await c.ecritureLigne.findMany({ where: { compte: "706", ecriture: { etablissementId: etabId, sourceType: "REPAS" } }, select: { debit: true, credit: true, ecriture: { select: { sourceId: true } } } })
    const parJour = new Map<string, { somme: number; n: number }>()
    for (const p of postes) {
      const j = (p.ecriture.sourceId ?? "").split(":")[0]
      const cur = parJour.get(j) ?? { somme: 0, n: 0 }
      parJour.set(j, { somme: cur.somme + p.credit - p.debit, n: cur.n + 1 })
    }
    for (const j of jours) {
      const reconnu = -Number(j.net)
      const cur = parJour.get(j.jour) ?? { somme: 0, n: 0 }
      const delta = reconnu - cur.somme
      if (delta === 0) continue
      prevus.push({
        journal: "VE",
        date: j.jour,
        piece: null,
        libelle: "Repas servis du " + j.jour,
        sourceType: "REPAS",
        sourceId: j.jour + ":" + (cur.n + 1),
        lignes: delta > 0 ? [D("4191", delta), C("706", delta)] : [D("706", -delta), C("4191", -delta)],
      })
    }
  }

  // Ventes au comptoir payees en especes ou Mobile Money : tresorerie contre produit, contrepassee si la vente est annulee.
  // Les ventes sur compte prepaye passent par les repas servis (debit du compte).
  const ventes = await c.venteComptoir.findMany({ where: { etablissementId: etabId, methode: { not: null } }, include: { remboursements: true }, orderBy: { numero: "asc" } })
  for (const v of ventes) {
    if (v.total - v.partCompte <= 0) continue
    const t = tresorerie(v.methode)
    const piece = numeroTicket(v.numero)
    for (const r of v.remboursements) {
      if (deja("VENTE_REMB", r.id) || r.montant <= 0) continue
      prevus.push({ journal: t.journal, date: jourIso(r.createdAt), piece, libelle: "Remboursement partiel de la vente " + piece + " (" + v.methode + ")", sourceType: "VENTE_REMB", sourceId: r.id, lignes: [D("706", r.montant), C(t.compte, r.montant)] })
    }
    const jour = jourIso(v.createdAt)
    if (!deja("VENTE", v.id)) {
      prevus.push({ journal: t.journal, date: jour, piece, libelle: "Vente au comptoir " + piece + " (" + v.methode + ")", sourceType: "VENTE", sourceId: v.id, lignes: [D(t.compte, v.total - v.partCompte), C("706", v.total - v.partCompte)] })
    }
    if (v.statut === "ANNULEE" && !deja("VENTE_ANNUL", v.id)) {
      const jourAnnulation = v.annuleeLe ? jourIso(v.annuleeLe) : jour
      prevus.push({ journal: t.journal, date: jourAnnulation > jour ? jourAnnulation : jour, piece, libelle: "Annulation de la vente " + piece + " (" + v.methode + ")", sourceType: "VENTE_ANNUL", sourceId: v.id, lignes: [D("706", v.total - v.partCompte), C(t.compte, v.total - v.partCompte)] })
    }
  }
  // Stock : receptions (dette fournisseur), consommations, pertes et regularisations d'inventaire.
  const mouvements = await c.mouvementStock.findMany({ where: { etablissementId: etabId }, include: { ingredient: { select: { name: true } } }, orderBy: { createdAt: "asc" } })
  const conso = new Map<string, number>()
  for (const m of mouvements) {
    const valeur = valeurStock(m.quantite, m.prix)
    if (valeur <= 0) continue
    if (m.type === "SORTIE" && m.consommationId) {
      conso.set(m.consommationId, (conso.get(m.consommationId) ?? 0) + valeur)
      continue
    }
    if (deja("MVT", m.id)) continue
    const base = { date: jourIso(m.createdAt), piece: m.reference, sourceType: "MVT", sourceId: m.id }
    const nom = m.ingredient.name
    if (m.type === "ENTREE") {
      if (m.bonId) prevus.push({ ...base, journal: "AC", libelle: "Réception — " + nom, lignes: [D("321", valeur), C("401", valeur)] })
      else prevus.push({ ...base, journal: "OD", libelle: "Entrée de stock hors commande — " + nom, lignes: [D("321", valeur), C("6032", valeur)] })
    } else if (m.type === "SORTIE") {
      prevus.push({ ...base, journal: "OD", libelle: "Sortie de stock — " + nom, lignes: [D("6032", valeur), C("321", valeur)] })
    } else if (m.type === "PERTE") {
      prevus.push({ ...base, journal: "OD", libelle: "Perte de denrées — " + nom, lignes: [D("658", valeur), C("321", valeur)] })
    } else {
      const hausse = Number(m.quantite) > 0
      prevus.push({ ...base, journal: "OD", libelle: "Régularisation d'inventaire — " + nom, lignes: hausse ? [D("321", valeur), C("6032", valeur)] : [D("6032", valeur), C("321", valeur)] })
    }
  }
  if (conso.size > 0) {
    const liste = await c.consommation.findMany({ where: { id: { in: [...conso.keys()] }, etablissementId: etabId } })
    for (const k of liste) {
      if (deja("CONSO", k.id)) continue
      const v = conso.get(k.id) ?? 0
      const jour = jourIso(k.date)
      prevus.push({ journal: "OD", date: jour, piece: null, libelle: "Consommation du " + jour + " (" + k.service + ", " + k.repas + " repas)", sourceType: "CONSO", sourceId: k.id, lignes: [D("6032", v), C("321", v)] })
    }
  }

  // Paie : un bulletin valide devient une ecriture (661, 664, 641 contre 421, 431, 447).
  const bulletins = await c.bulletinPaie.findMany({ where: { etablissementId: etabId, statut: "VALIDATED" }, include: { employe: { select: { matricule: true, firstName: true, lastName: true } } }, orderBy: [{ periode: "asc" }, { createdAt: "asc" }] })
  for (const b of bulletins) {
    if (deja("PAIE", b.id)) continue
    const charges = b.retraitePatronale + b.pf + b.maternite + b.at + b.cmuPatronale
    const [an, mois] = b.periode.split("-").map(Number)
    const lignes = [D("661", b.brut), D("664", charges), D("641", b.taxesPatronales), C("421", b.net), C("431", b.retraiteSalarie + b.cmuSalarie + charges), C("447", b.its + b.taxesPatronales)].filter((l) => l.debit > 0 || l.credit > 0)
    prevus.push({ journal: "OD", date: new Date(Date.UTC(an, mois, 0)).toISOString().slice(0, 10), piece: "PAIE-" + b.periode, libelle: "Paie " + b.periode + " - " + b.employe.matricule + " " + b.employe.firstName + " " + b.employe.lastName, sourceType: "PAIE", sourceId: b.id, lignes })
  }

  prevus.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return prevus
}

// Verrou par etablissement : la numerotation reste continue meme avec deux comptabilisations simultanees.
export async function ouvrirContexte(tx: Client, etabId: string, userEmail: string): Promise<Contexte> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${etabId}))::text AS v`
  const max = await tx.ecritureCompta.aggregate({ where: { etablissementId: etabId }, _max: { numero: true } })
  const cl = await tx.clotureCompta.findFirst({ where: { etablissementId: etabId }, orderBy: { periode: "desc" }, select: { periode: true } })
  return { etabId, userEmail, suivant: (max._max.numero ?? 0) + 1, derniere: cl?.periode ?? null }
}

export async function poster(tx: Client, ctx: Contexte, p: Poste): Promise<number> {
  let debit = 0
  let credit = 0
  for (const l of p.lignes) {
    if (!Object.hasOwn(PLAN, l.compte)) throw new ErreurCompta("Compte inconnu : " + l.compte)
    if (!Number.isInteger(l.debit) || !Number.isInteger(l.credit) || l.debit < 0 || l.credit < 0 || (l.debit > 0 && l.credit > 0)) throw new ErreurCompta("Ligne d'écriture invalide.")
    debit += l.debit
    credit += l.credit
  }
  if (debit <= 0 || debit !== credit) throw new ErreurCompta("Écriture déséquilibrée.")
  const r = ajusterDate(p.date, ctx.derniere)
  const numero = ctx.suivant
  ctx.suivant += 1
  await tx.ecritureCompta.create({
    data: {
      etablissementId: ctx.etabId,
      numero,
      journal: p.journal,
      date: versDate(r.date),
      piece: p.piece ?? null,
      libelle: (p.libelle + (r.decale ? " (rattrapage du " + p.date + ", période clôturée)" : "")).slice(0, 200),
      sourceType: p.sourceType ?? null,
      sourceId: p.sourceId ?? null,
      createdBy: ctx.userEmail,
      lignes: { create: p.lignes.map((l) => ({ compte: l.compte, debit: l.debit, credit: l.credit })) },
    },
  })
  return numero
}

export async function comptabiliser(o: { etabId: string; userEmail: string }): Promise<{ ecritures: number; total: number }> {
  return db.$transaction(
    async (tx) => {
      const ctx = await ouvrirContexte(tx, o.etabId, o.userEmail)
      const prevus = await planifier(tx, o.etabId)
      let total = 0
      for (const p of prevus) {
        await poster(tx, ctx, p)
        total += p.lignes.reduce((s, l) => s + l.debit, 0)
      }
      return { ecritures: prevus.length, total }
    },
    { timeout: 120_000, maxWait: 10_000 },
  )
}

// Cloture sequentielle d'un mois passe : tout ce qui est en attente est d'abord comptabilise, puis la periode est verrouillee.
export async function cloturerPeriode(o: { etabId: string; periode: string; userEmail: string; aujourdhui: string }): Promise<{ erreur: string } | { ecritures: number }> {
  return db.$transaction(
    async (tx) => {
      const ctx = await ouvrirContexte(tx, o.etabId, o.userEmail)
      if (o.periode >= o.aujourdhui.slice(0, 7)) return { erreur: "Cette période n'est pas terminée : clôturez un mois passé." }
      if (ctx.derniere && o.periode !== moisSuivant(ctx.derniere)) {
        return { erreur: ctx.derniere >= o.periode ? "Cette période est déjà clôturée." : "Clôturez d'abord " + libellePeriode(moisSuivant(ctx.derniere)) + "." }
      }
      const prevus = await planifier(tx, o.etabId)
      for (const p of prevus) await poster(tx, ctx, p)
      await tx.clotureCompta.create({ data: { etablissementId: o.etabId, periode: o.periode, clotureePar: o.userEmail } })
      return { ecritures: prevus.length }
    },
    { timeout: 120_000, maxWait: 10_000 },
  )
}