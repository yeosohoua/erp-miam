"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"

import { ecrireAudit } from "@/lib/audit"
import { aidesActivesPour } from "@/lib/aides"
import { prixApresAides } from "@/lib/aides-base"
import { db } from "@/lib/db"
import { aujourdhui, formaterMontant, serviceValide, versDate } from "@/lib/menus"
import { notifierApresService } from "@/lib/notifications"
import { infoTarif, servirReservation } from "@/lib/paiements"
import { accesReservationsEcriture } from "@/lib/reservations-acces"
import { formaterHeure, type ResultatScan } from "@/lib/service"

// Scan d'un badge (ou saisie d'un matricule) pour le service choisi, aujourd'hui, dans l'etablissement actif.
export async function scanner(service: string, _etat: ResultatScan, fd: FormData): Promise<ResultatScan> {
  const at = Date.now()
  const acces = await accesReservationsEcriture()
  if ("erreur" in acces) return { at, statut: "ERREUR", message: acces.erreur }
  const { session, etabId } = acces
  if (!serviceValide(service)) return { at, statut: "ERREUR", message: "Service invalide." }
  const forcer = fd.get("forcer") === "1"
  const code = String(fd.get("code") ?? "").trim()
  if (!forcer && !code) return { at, statut: "ERREUR", message: "Scannez un badge ou saisissez un matricule." }

  const jour = aujourdhui()
  const date = versDate(jour)
  const menu = await db.menu.findUnique({ where: { etablissementId_date_service: { etablissementId: etabId, date, service } }, select: { statut: true } })
  if (!menu || menu.statut !== "PUBLISHED") return { at, statut: "FERME", message: "Aucun menu publié pour ce service : service fermé." }

  const inscrit = await db.inscrit.findFirst({
    where: forcer ? { id: String(fd.get("inscritId") ?? ""), etablissementId: etabId } : { etablissementId: etabId, OR: [{ badge: code.toUpperCase() }, { matricule: code }] },
    include: { groupe: true, regime: true, allergies: { include: { allergie: true } } },
  })
  if (!inscrit) return { at, statut: "INCONNU", message: "Badge ou matricule inconnu dans cet établissement." }
  const resume = {
    id: inscrit.id,
    nom: inscrit.lastName + " " + inscrit.firstName,
    matricule: inscrit.matricule,
    groupe: inscrit.groupe?.name ?? null,
    regime: inscrit.regime?.name ?? null,
    allergies: inscrit.allergies.map((a) => a.allergie.name),
  }
  if (inscrit.statut !== "ACTIVE") return { at, statut: "INACTIF", message: "Cet inscrit n'est pas actif.", inscrit: resume }

  const tarif = await infoTarif(etabId, service)
  const aidesRepas = tarif.actif ? await aidesActivesPour(etabId, inscrit.id, jour) : []
  const prixRepas = prixApresAides(tarif.prix, aidesRepas).prix
  const libellePaiement = (debit: number, solde: number | null): string | undefined =>
    debit > 0 && solde !== null ? "Débité " + formaterMontant(debit, tarif.devise) + " · solde " + formaterMontant(solde, tarif.devise) : undefined

  const existante = await db.reservation.findUnique({ where: { inscritId_date_service: { inscritId: inscrit.id, date, service } } })
  if (existante?.statut === "BOOKED" && existante.servedAt) {
    const heure = formaterHeure(existante.servedAt)
    return { at, statut: "DEJA", message: "Déjà servi à " + heure + ".", inscrit: resume, heure }
  }
  if (existante?.statut === "BOOKED") {
    const insuffisant = tarif.actif && inscrit.solde < prixRepas
    if (insuffisant && !forcer) {
      return {
        at,
        statut: "SOLDE_INSUFFISANT",
        message: "Solde insuffisant : " + formaterMontant(inscrit.solde, tarif.devise) + " pour un repas à " + formaterMontant(prixRepas, tarif.devise) + ".",
        inscrit: resume,
      }
    }
    const sortie = await servirReservation({ etabId, userEmail: session.email, reservationId: existante.id })
    if (sortie.deja) return { at, statut: "DEJA", message: "Déjà servi.", inscrit: resume }
    await ecrireAudit({
      userId: session.userId,
      userEmail: session.email,
      action: "SERVICE_SERVED",
      entity: "Reservation",
      entityId: existante.id,
      details: jour + " " + service + " " + inscrit.matricule + (insuffisant ? " (solde négatif)" : ""),
    })
    revalidatePath("/service", "layout")
    revalidatePath("/paiements", "layout")
    after(() => notifierApresService({ etabId, inscritId: inscrit.id, reservationId: existante.id, service, solde: sortie.solde }))
    return { at, statut: "SERVI", message: "Repas servi.", inscrit: resume, heure: formaterHeure(new Date()), paiement: libellePaiement(sortie.debit, sortie.solde) }
  }
  if (!forcer) return { at, statut: "SANS_RESERVATION", message: "Aucune réservation pour ce service.", inscrit: resume }

  // Exception explicite : repas servi hors reservation, trace dans l'audit.
  const sortie = await servirReservation({ etabId, userEmail: session.email, horsReservation: { inscritId: inscrit.id, date, service } })
  if (sortie.deja) return { at, statut: "DEJA", message: "Déjà servi.", inscrit: resume }
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "SERVICE_WALKIN", entity: "Reservation", entityId: sortie.reservationId, details: jour + " " + service + " " + inscrit.matricule })
  revalidatePath("/service", "layout")
  revalidatePath("/paiements", "layout")
  after(() => notifierApresService({ etabId, inscritId: inscrit.id, reservationId: sortie.reservationId, service, solde: sortie.solde }))
  return { at, statut: "SERVI", message: "Servi hors réservation (exception tracée).", inscrit: resume, heure: formaterHeure(new Date()), paiement: libellePaiement(sortie.debit, sortie.solde) }
}