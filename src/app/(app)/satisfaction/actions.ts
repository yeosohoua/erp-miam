"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { aujourdhui, dateValide, serviceValide, versDate } from "@/lib/menus"
import { SOURCES_AVIS, STATUTS_SUGGESTION, type SourceAvisCle, type StatutSuggestionCle } from "@/lib/satisfaction-base"
import { accesSatisfactionSaisie, accesSatisfactionTraitement } from "@/lib/satisfaction-acces"
import type { SessionData } from "@/lib/session-token"

const rafraichir = () => revalidatePath("/satisfaction", "layout")
const nettoyer = (v: FormDataEntryValue | null): string => String(v ?? "").trim()

async function audit(session: SessionData, action: string, entityId: string, details: string): Promise<void> {
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action, entity: "Satisfaction", entityId, details })
}

export async function enregistrerAvis(_p: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesSatisfactionSaisie()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const date = nettoyer(fd.get("date"))
  const service = nettoyer(fd.get("service"))
  const platId = nettoyer(fd.get("platId"))
  const noteBrut = nettoyer(fd.get("note"))
  const source = nettoyer(fd.get("source"))
  const auteur = nettoyer(fd.get("auteur"))
  const commentaire = nettoyer(fd.get("commentaire"))
  if (!dateValide(date) || date > aujourdhui()) return { error: "Date invalide (pas dans le futur)." }
  if (!serviceValide(service)) return { error: "Choisissez un service." }
  const note = /^[1-5]$/.test(noteBrut) ? Number(noteBrut) : 0
  if (note === 0) return { error: "Note invalide : de 1 à 5." }
  if (!(SOURCES_AVIS as readonly string[]).includes(source)) return { error: "Source invalide." }
  if (commentaire.length > 500) return { error: "Commentaire trop long (500 caractères maximum)." }
  if (auteur.length > 60) return { error: "Nom de l'auteur trop long (60 caractères maximum)." }
  let plat: { id: string; name: string } | null = null
  if (platId) {
    plat = await db.plat.findFirst({ where: { id: platId, etablissementId: etabId }, select: { id: true, name: true } })
    if (!plat) return { error: "Plat introuvable." }
  }
  const a = await db.avis.create({
    data: { etablissementId: etabId, date: versDate(date), service, platId: plat?.id ?? null, platNom: plat?.name ?? null, note, commentaire: commentaire || null, source: source as SourceAvisCle, auteur: auteur || null },
  })
  await audit(session, "AVIS_ENREGISTRE", a.id, date + " · " + service + " · " + note + "/5" + (plat ? " · " + plat.name : ""))
  rafraichir()
  const total = await db.avis.count({ where: { etablissementId: etabId } })
  return { ok: "Avis enregistré (" + total + " au total)." }
}

export async function supprimerAvis(id: string, _fd: FormData): Promise<void> {
  const acces = await accesSatisfactionTraitement()
  if ("erreur" in acces) return
  const { session, etabId } = acces
  const a = await db.avis.findFirst({ where: { id, etablissementId: etabId } })
  if (!a) return
  await db.avis.delete({ where: { id: a.id } })
  await audit(session, "AVIS_SUPPRIME", a.id, a.note + "/5" + (a.platNom ? " · " + a.platNom : ""))
  rafraichir()
}

export async function proposerSuggestion(_p: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesSatisfactionSaisie()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const titre = nettoyer(fd.get("titre"))
  const detail = nettoyer(fd.get("detail"))
  const auteur = nettoyer(fd.get("auteur"))
  if (titre.length < 3) return { error: "Titre trop court (3 caractères au moins)." }
  if (titre.length > 100) return { error: "Titre trop long (100 caractères maximum)." }
  if (detail.length > 500) return { error: "Détail trop long (500 caractères maximum)." }
  if (auteur.length > 60) return { error: "Nom de l'auteur trop long (60 caractères maximum)." }
  const doublon = await db.suggestion.findFirst({ where: { etablissementId: etabId, titre: { equals: titre, mode: "insensitive" }, statut: { in: ["NOUVELLE", "EN_COURS"] } } })
  if (doublon) return { error: "Une suggestion identique est déjà en cours." }
  const s = await db.suggestion.create({ data: { etablissementId: etabId, titre, detail: detail || null, auteur: auteur || null } })
  await audit(session, "SUGGESTION_CREEE", s.id, titre)
  rafraichir()
  return { ok: "Suggestion enregistrée." }
}

export async function traiterSuggestion(id: string, fd: FormData): Promise<void> {
  const acces = await accesSatisfactionTraitement()
  if ("erreur" in acces) return
  const { session, etabId } = acces
  const statut = nettoyer(fd.get("statut"))
  const reponse = nettoyer(fd.get("reponse"))
  if (!(STATUTS_SUGGESTION as readonly string[]).includes(statut) || reponse.length > 500) return
  const s = await db.suggestion.findFirst({ where: { id, etablissementId: etabId } })
  if (!s) return
  await db.suggestion.update({ where: { id: s.id }, data: { statut: statut as StatutSuggestionCle, reponse: reponse || null, traitePar: session.userId } })
  await audit(session, "SUGGESTION_TRAITEE", s.id, s.titre + " · " + statut)
  rafraichir()
}