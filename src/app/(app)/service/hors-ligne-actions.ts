"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EntreeSync, Instantane, IssueSync, RapportSync } from "@/lib/hors-ligne"
import { ajouterJours, aujourdhui, dateValide, serviceValide, versDate } from "@/lib/menus"
import { notifierApresService } from "@/lib/notifications"
import { aidesActivesPour } from "@/lib/aides"
import { prixApresAides } from "@/lib/aides-base"
import { infoTarif, servirReservation } from "@/lib/paiements"
import { accesReservationsEcriture } from "@/lib/reservations-acces"
import { formaterHeure } from "@/lib/service"

// Liste du jour pour un service : uniquement les repas reserves de personnes actives, avec ce qu'il faut pour decider sans reseau.
export async function preparerHorsLigne(service: string): Promise<Instantane | { erreur: string }> {
  const acces = await accesReservationsEcriture()
  if ("erreur" in acces) return { erreur: acces.erreur }
  const { session, etabId } = acces
  if (!serviceValide(service)) return { erreur: "Service invalide." }
  const jour = aujourdhui()
  const date = versDate(jour)
  const [menu, tarif, reservations] = await Promise.all([
    db.menu.findUnique({ where: { etablissementId_date_service: { etablissementId: etabId, date, service } }, select: { statut: true } }),
    infoTarif(etabId, service),
    db.reservation.findMany({
      where: { etablissementId: etabId, date, service, statut: "BOOKED" },
      take: 3000,
      include: {
        inscrit: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            matricule: true,
            badge: true,
            statut: true,
            solde: true,
            groupe: { select: { name: true } },
            regime: { select: { name: true } },
            allergies: { select: { allergie: { select: { name: true } } } },
          },
        },
      },
    }),
  ])
  const jourAide = versDate(jour)
  const avecAide = tarif.actif
    ? await db.aideInscrit.findMany({
        where: { etablissementId: etabId, debut: { lte: jourAide }, OR: [{ fin: null }, { fin: { gte: jourAide } }] },
        select: { inscritId: true },
        distinct: ["inscritId"],
        take: 3000,
      })
    : []
  const prixParInscrit = new Map<string, number>()
  await Promise.all(
    avecAide.map(async (x) => {
      const aidesInscrit = await aidesActivesPour(etabId, x.inscritId, jour)
      prixParInscrit.set(x.inscritId, prixApresAides(tarif.prix, aidesInscrit).prix)
    }),
  )
  const items = reservations
    .filter((r) => r.inscrit.statut === "ACTIVE")
    .map((r) => ({
      id: r.inscrit.id,
      nom: r.inscrit.lastName + " " + r.inscrit.firstName,
      matricule: r.inscrit.matricule,
      badge: r.inscrit.badge,
      groupe: r.inscrit.groupe?.name ?? null,
      regime: r.inscrit.regime?.name ?? null,
      allergies: r.inscrit.allergies.map((a) => a.allergie.name),
      solde: r.inscrit.solde,
      prix: prixParInscrit.get(r.inscrit.id) ?? tarif.prix,
      servi: !!r.servedAt,
      heure: r.servedAt ? formaterHeure(r.servedAt) : null,
    }))
  return { etabId, userId: session.userId, service, jour, genereLe: Date.now(), prix: tarif.prix, actif: tarif.actif, devise: tarif.devise, menuPublie: menu?.statut === "PUBLISHED", items, horsListe: [] }
}

function lireEntrees(brut: unknown): EntreeSync[] | null {
  if (!Array.isArray(brut) || brut.length === 0 || brut.length > 200) return null
  const sortie: EntreeSync[] = []
  for (const x of brut) {
    if (typeof x !== "object" || x === null) return null
    const o = x as Record<string, unknown>
    const id = o.id
    const code = o.code
    const service = o.service
    const jour = o.jour
    const forcer = o.forcer
    const at = o.at
    if (typeof id !== "string" || id.length < 1 || id.length > 64) return null
    if (typeof code !== "string" || code.trim().length < 1 || code.length > 64) return null
    if (typeof service !== "string" || !serviceValide(service)) return null
    if (typeof jour !== "string" || !dateValide(jour)) return null
    if (typeof forcer !== "boolean" || typeof at !== "number" || !Number.isFinite(at)) return null
    sortie.push({ id, code, service, jour, forcer, at })
  }
  return sortie
}

const horodatage = (at: number): Date => {
  const maintenant = Date.now()
  return at <= maintenant + 60_000 && at > maintenant - 4 * 86_400_000 ? new Date(at) : new Date(maintenant)
}

// Le repas a deja ete servi sur place : le serveur enregistre la realite (jamais de refus pour solde ou reservation).
// Un passage qui echoue pour une raison technique n'est pas renvoye dans le rapport : l'appareil le garde et reessaie.
export async function synchroniserPassages(json: string): Promise<RapportSync> {
  const acces = await accesReservationsEcriture()
  if ("erreur" in acces) return { erreur: acces.erreur }
  const { session, etabId } = acces
  let brut: unknown
  try {
    brut = JSON.parse(json)
  } catch {
    return { erreur: "Données de synchronisation invalides." }
  }
  const entrees = lireEntrees(brut)
  if (!entrees) return { erreur: "Données de synchronisation invalides." }
  entrees.sort((a, b) => a.at - b.at)

  const auj = aujourdhui()
  const limite = ajouterJours(auj, -3)
  const issues: IssueSync[] = []

  for (const e of entrees) {
    const rejet = (message: string, nom: string): IssueSync => ({ id: e.id, issue: "REJET", message, nom })
    try {
      if (e.jour > auj || e.jour < limite) {
        issues.push(rejet("Date hors de la période de synchronisation (3 jours).", e.code))
        continue
      }
      const date = versDate(e.jour)
      const menu = await db.menu.findUnique({ where: { etablissementId_date_service: { etablissementId: etabId, date, service: e.service } }, select: { statut: true } })
      if (!menu || menu.statut !== "PUBLISHED") {
        issues.push(rejet("Menu non publié pour ce service ce jour-là.", e.code))
        continue
      }
      const code = e.code.trim()
      const inscrit = await db.inscrit.findFirst({
        where: { etablissementId: etabId, OR: [{ badge: code.toUpperCase() }, { matricule: code }] },
        select: { id: true, matricule: true, firstName: true, lastName: true, statut: true, solde: true },
      })
      if (!inscrit) {
        issues.push(rejet("Badge ou matricule inconnu dans cet établissement.", code))
        continue
      }
      const nom = inscrit.lastName + " " + inscrit.firstName
      if (inscrit.statut !== "ACTIVE") {
        issues.push(rejet("Cet inscrit n'est pas actif.", nom))
        continue
      }
      const existante = await db.reservation.findUnique({ where: { inscritId_date_service: { inscritId: inscrit.id, date, service: e.service } } })
      if (existante?.statut === "BOOKED" && existante.servedAt) {
        issues.push({ id: e.id, issue: "DOUBLON", message: "Déjà servi à " + formaterHeure(existante.servedAt) + " (autre passage).", nom })
        continue
      }
      const tarif = await infoTarif(etabId, e.service)
      const insuffisant = tarif.actif && inscrit.solde < tarif.prix
      const servedAt = horodatage(e.at)
      const horsReservation = existante?.statut !== "BOOKED"
      const sortie = horsReservation
        ? await servirReservation({ etabId, userEmail: session.email, horsReservation: { inscritId: inscrit.id, date, service: e.service }, servedAt })
        : await servirReservation({ etabId, userEmail: session.email, reservationId: existante.id, servedAt })
      if (sortie.deja) {
        issues.push({ id: e.id, issue: "DOUBLON", message: "Déjà servi (autre passage).", nom })
        continue
      }
      await ecrireAudit({
        userId: session.userId,
        userEmail: session.email,
        action: horsReservation ? "SERVICE_WALKIN" : "SERVICE_SERVED",
        entity: "Reservation",
        entityId: sortie.reservationId,
        details: e.jour + " " + e.service + " " + inscrit.matricule + " (hors-ligne)" + (insuffisant ? " (solde négatif)" : ""),
      })
      after(() => notifierApresService({ etabId, inscritId: inscrit.id, reservationId: sortie.reservationId, service: e.service, solde: sortie.solde }))
      issues.push({ id: e.id, issue: "OK", message: horsReservation ? "Enregistré hors réservation." : "Enregistré.", nom })
    } catch (err) {
      console.error("Synchronisation d'un passage en echec", err)
    }
  }

  if (issues.length > 0) {
    const ok = issues.filter((i) => i.issue === "OK").length
    const doublons = issues.filter((i) => i.issue === "DOUBLON").length
    const rejets = issues.filter((i) => i.issue === "REJET").length
    await ecrireAudit({
      userId: session.userId,
      userEmail: session.email,
      action: "SERVICE_SYNC",
      entity: "Etablissement",
      entityId: etabId,
      details: issues.length + " passage(s) : " + ok + " enregistré(s), " + doublons + " doublon(s), " + rejets + " rejeté(s)",
    })
    revalidatePath("/service", "layout")
    revalidatePath("/paiements", "layout")
  }
  return { issues }
}