import "server-only"

import { erreur } from "@/lib/api-auth"
import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { enfantsDe } from "@/lib/famille"
import { ajouterJours, aujourdhui, dateValide, serviceValide, versDate } from "@/lib/menus"
import type { AuthMobile } from "@/lib/mobile-auth"

export type Fiche = {
  id: string
  etablissementId: string
  matricule: string
  nom: string
  statut: string
  solde: number
  groupe: string | null
  etab: { id: string; name: string; currency: string; prepaye: boolean }
}

// Fiches que la personne connectee peut consulter : ses enfants (parent) ou elle-meme (eleve).
export async function fichesAccessibles(a: AuthMobile): Promise<Fiche[]> {
  if (a.role === "PARENT") {
    const liste = await enfantsDe(a.email)
    return liste.map((i) => ({
      id: i.id,
      etablissementId: i.etablissementId,
      matricule: i.matricule,
      nom: i.firstName + " " + i.lastName,
      statut: String(i.statut),
      solde: Number(i.solde),
      groupe: i.groupe?.name ?? null,
      etab: { id: i.etablissement.id, name: i.etablissement.name, currency: i.etablissement.currency, prepaye: i.etablissement.prepaye },
    }))
  }
  if (a.role === "ELEVE") {
    const i = await db.inscrit.findFirst({
      where: { codeAcces: { is: { userId: a.userId } }, statut: { not: "LEFT" } },
      include: { groupe: true, etablissement: { select: { id: true, name: true, currency: true, prepaye: true } } },
    })
    if (!i) return []
    return [
      {
        id: i.id,
        etablissementId: i.etablissementId,
        matricule: i.matricule,
        nom: i.firstName + " " + i.lastName,
        statut: String(i.statut),
        solde: Number(i.solde),
        groupe: i.groupe?.name ?? null,
        etab: { id: i.etablissement.id, name: i.etablissement.name, currency: i.etablissement.currency, prepaye: i.etablissement.prepaye },
      },
    ]
  }
  return []
}

// Choisit la fiche demandee (ou la premiere). Renvoie une reponse d'erreur si l'acces est refuse.
export async function choisirFiche(a: AuthMobile, inscritId: string | null | undefined): Promise<Fiche | Response> {
  if (a.role !== "PARENT" && a.role !== "ELEVE") return erreur(403, "Réservé aux parents et aux élèves.")
  const fiches = await fichesAccessibles(a)
  if (fiches.length === 0) return erreur(404, "Aucun inscrit rattaché à ce compte.")
  if (!inscritId) return fiches[0]
  const f = fiches.find((x) => x.id === inscritId)
  return f ?? erreur(404, "Inscrit introuvable.")
}

type Resultat = { status: number; erreur: string } | { ok: string }

export async function reserverRepas(f: Fiche, a: AuthMobile, dateIso: string, service: string): Promise<Resultat> {
  if (f.statut !== "ACTIVE") return { status: 403, erreur: "Le compte de cet inscrit n'est pas actif." }
  if (!dateValide(dateIso) || !serviceValide(service)) return { status: 400, erreur: "Créneau invalide." }
  const jour = aujourdhui()
  if (dateIso < jour || dateIso > ajouterJours(jour, 13)) return { status: 400, erreur: "Réservation possible d'aujourd'hui à 14 jours." }
  const date = versDate(dateIso)
  const menu = await db.menu.findUnique({ where: { etablissementId_date_service: { etablissementId: f.etablissementId, date, service } }, select: { statut: true } })
  if (!menu || menu.statut !== "PUBLISHED") return { status: 404, erreur: "Aucun menu publié pour ce créneau." }
  const ex = await db.reservation.findUnique({ where: { inscritId_date_service: { inscritId: f.id, date, service } } })
  if (ex?.statut === "BOOKED") return { status: 409, erreur: "Déjà réservé." }
  if (ex) await db.reservation.update({ where: { id: ex.id }, data: { statut: "BOOKED", servedAt: null } })
  else await db.reservation.create({ data: { etablissementId: f.etablissementId, inscritId: f.id, date, service } })
  await ecrireAudit({ userId: a.userId, userEmail: a.email, action: "RESERVATION_CREATED", entity: "Reservation", details: dateIso + " " + service + " " + f.matricule + " (mobile)" })
  return { ok: "Repas réservé." }
}

export async function annulerRepas(f: Fiche, a: AuthMobile, dateIso: string, service: string): Promise<Resultat> {
  if (!dateValide(dateIso) || !serviceValide(service)) return { status: 400, erreur: "Créneau invalide." }
  if (dateIso < aujourdhui()) return { status: 400, erreur: "Les réservations passées ne peuvent plus être annulées." }
  const ex = await db.reservation.findUnique({ where: { inscritId_date_service: { inscritId: f.id, date: versDate(dateIso), service } } })
  if (!ex || ex.statut !== "BOOKED") return { status: 404, erreur: "Aucune réservation à annuler." }
  if (ex.servedAt) return { status: 409, erreur: "Repas déjà servi." }
  await db.reservation.update({ where: { id: ex.id }, data: { statut: "CANCELLED" } })
  await ecrireAudit({ userId: a.userId, userEmail: a.email, action: "RESERVATION_CANCELLED", entity: "Reservation", entityId: ex.id, details: dateIso + " " + service + " " + f.matricule + " (mobile)" })
  return { ok: "Réservation annulée." }
}