"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"

import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { ORDRE_SERVICES, SERVICES, formaterMontant } from "@/lib/menus"
import { notifierRecharge } from "@/lib/notifications"
import { accesPaiementsConfig, accesPaiementsEcriture } from "@/lib/paiements-acces"
import { MONTANT_MAX, PRIX_MAX, methodeValide, parseMontant } from "@/lib/paiements-base"

const rafraichir = () => {
  revalidatePath("/paiements", "layout")
  revalidatePath("/", "layout")
}
const devise = async (etabId: string): Promise<string> => (await db.etablissement.findUnique({ where: { id: etabId }, select: { currency: true } }))?.currency ?? "XOF"
const estDoublon = (e: unknown): boolean => e instanceof Error && (("code" in e && (e as { code?: string }).code === "P2002") || /unique/i.test(e.message))

// Recharge d'un compte : espèces ou Mobile Money (référence de la transaction obligatoire et unique).
export async function recharger(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesPaiementsEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const matricule = String(fd.get("matricule") ?? "").trim()
  const montant = parseMontant(String(fd.get("montant") ?? ""))
  const methode = String(fd.get("methode") ?? "")
  const reference = String(fd.get("reference") ?? "").trim()
  if (!matricule) return { error: "Saisissez un matricule." }
  if (montant === null || montant < 1) return { error: "Montant invalide : un entier entre 1 et " + MONTANT_MAX.toLocaleString("fr-FR") + "." }
  if (!methodeValide(methode)) return { error: "Choisissez un mode de paiement." }
  if (reference.length > 60) return { error: "Référence trop longue (60 caractères maximum)." }
  if (methode !== "CASH" && reference.length < 4) return { error: "La référence de la transaction Mobile Money est obligatoire (4 caractères minimum)." }

  const ins = await db.inscrit.findUnique({ where: { etablissementId_matricule: { etablissementId: etabId, matricule } }, select: { id: true, statut: true } })
  if (!ins) return { error: "Matricule inconnu dans cet établissement." }
  if (ins.statut === "LEFT") return { error: "Cet inscrit a quitté l'établissement : rechargement impossible." }
  if (reference && (await db.transaction.findFirst({ where: { etablissementId: etabId, reference }, select: { id: true } }))) {
    return { error: "Cette référence de transaction a déjà été enregistrée." }
  }
  try {
    const sortie = await db.$transaction(async (tx) => {
      await tx.transaction.create({ data: { etablissementId: etabId, inscritId: ins.id, type: "TOPUP", methode, montant, reference: reference || null, createdBy: session.email } })
      return tx.inscrit.update({ where: { id: ins.id }, data: { solde: { increment: montant } }, select: { solde: true } })
    })
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "PAIEMENT_TOPUP", entity: "Inscrit", entityId: ins.id, details: matricule + " +" + montant + " " + methode + (reference ? " " + reference : "") })
    rafraichir()
    after(() => notifierRecharge(ins.id, montant))
    const d = await devise(etabId)
    return { ok: "Recharge de " + formaterMontant(montant, d) + " enregistrée. Nouveau solde : " + formaterMontant(sortie.solde, d) + "." }
  } catch (e) {
    if (estDoublon(e)) return { error: "Cette référence de transaction a déjà été enregistrée." }
    console.error("Recharge en echec", e)
    return { error: "Recharge impossible, réessayez." }
  }
}

// Correction manuelle (positive ou négative), motif obligatoire, réservée aux responsables.
export async function ajuster(inscritId: string, _etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesPaiementsConfig()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const montant = parseMontant(String(fd.get("montant") ?? ""), true)
  const motif = String(fd.get("motif") ?? "").trim()
  if (montant === null || montant === 0) return { error: "Montant invalide : un entier non nul, positif ou négatif." }
  if (motif.length < 3) return { error: "Indiquez le motif de l'ajustement (3 caractères minimum)." }
  if (motif.length > 200) return { error: "Motif trop long (200 caractères maximum)." }
  const ins = await db.inscrit.findFirst({ where: { id: inscritId, etablissementId: etabId }, select: { id: true, matricule: true } })
  if (!ins) return { error: "Inscrit introuvable." }
  const sortie = await db.$transaction(async (tx) => {
    await tx.transaction.create({ data: { etablissementId: etabId, inscritId: ins.id, type: "ADJUST", montant, note: motif, createdBy: session.email } })
    return tx.inscrit.update({ where: { id: ins.id }, data: { solde: { increment: montant } }, select: { solde: true } })
  })
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "PAIEMENT_ADJUST", entity: "Inscrit", entityId: ins.id, details: ins.matricule + " " + (montant > 0 ? "+" : "") + montant + " " + motif })
  rafraichir()
  return { ok: "Ajustement enregistré. Nouveau solde : " + formaterMontant(sortie.solde, await devise(etabId)) + "." }
}

// Prix par service et activation du débit automatique (compte prépayé).
export async function enregistrerTarifs(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesPaiementsConfig()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const prix: Record<string, number> = {}
  for (const s of ORDRE_SERVICES) {
    const v = parseMontant(String(fd.get("prix_" + s) ?? ""))
    if (v === null || v > PRIX_MAX) return { error: "Prix invalide pour " + SERVICES[s] + " : un entier de 0 à " + PRIX_MAX.toLocaleString("fr-FR") + "." }
    prix[s] = v
  }
  const prepaye = fd.get("prepaye") === "on"
  await db.$transaction([
    ...ORDRE_SERVICES.map((s) =>
      db.tarif.upsert({ where: { etablissementId_service: { etablissementId: etabId, service: s } }, create: { etablissementId: etabId, service: s, prix: prix[s] }, update: { prix: prix[s] } }),
    ),
    db.etablissement.update({ where: { id: etabId }, data: { prepaye } }),
  ])
  await ecrireAudit({
    userId: session.userId,
    userEmail: session.email,
    action: "PAIEMENT_TARIFS",
    entity: "Etablissement",
    entityId: etabId,
    details: ORDRE_SERVICES.map((s) => s + "=" + prix[s]).join(" ") + " prepaye=" + prepaye,
  })
  rafraichir()
  return { ok: "Tarifs enregistrés." }
}