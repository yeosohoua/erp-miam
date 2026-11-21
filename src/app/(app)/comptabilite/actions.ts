"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { JOURNAUX, PLAN, moisValide, numeroEcriture } from "@/lib/compta-base"
import { accesComptaCloture, accesComptaEcriture } from "@/lib/compta-acces"
import { ErreurCompta, cloturerPeriode, comptabiliser, ouvrirContexte, poster } from "@/lib/compta"
import { db } from "@/lib/db"
import type { EtatAction } from "@/lib/etat-action"
import { libellePeriode } from "@/lib/facturation-base"
import { aujourdhui, dateValide, formaterMontant } from "@/lib/menus"
import { MONTANT_MAX, parseMontant } from "@/lib/paiements-base"

const rafraichir = () => {
  revalidatePath("/comptabilite", "layout")
  revalidatePath("/", "layout")
}
const nettoyer = (v: FormDataEntryValue | null): string => String(v ?? "").trim()
const estDoublon = (e: unknown): boolean => e instanceof Error && (("code" in e && (e as { code?: string }).code === "P2002") || /unique/i.test(e.message))

export async function comptabiliserAction(_etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _etat
  void _fd
  const acces = await accesComptaEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  try {
    const r = await comptabiliser({ etabId, userEmail: session.email })
    if (r.ecritures === 0) return { ok: "Rien à comptabiliser : tout est à jour." }
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "COMPTA_COMPTABILISEE", entity: "Etablissement", entityId: etabId, details: r.ecritures + " écriture(s), total " + r.total })
    rafraichir()
    return { ok: r.ecritures + " écriture(s) comptabilisée(s)." }
  } catch (e) {
    console.error("Comptabilisation en echec", e)
    return { error: "Comptabilisation impossible, réessayez." }
  }
}

export async function saisirEcriture(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesComptaEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const date = nettoyer(fd.get("date"))
  const journal = nettoyer(fd.get("journal"))
  const piece = nettoyer(fd.get("piece"))
  const libelle = nettoyer(fd.get("libelle"))
  const debit = nettoyer(fd.get("debit"))
  const credit = nettoyer(fd.get("credit"))
  const montant = parseMontant(nettoyer(fd.get("montant")))
  if (!dateValide(date)) return { error: "Date invalide." }
  if (date > aujourdhui()) return { error: "La date ne peut pas être dans le futur." }
  if (!Object.hasOwn(JOURNAUX, journal)) return { error: "Choisissez un journal." }
  if (piece.length > 40) return { error: "Pièce trop longue (40 caractères maximum)." }
  if (libelle.length < 3 || libelle.length > 120) return { error: "Le libellé doit comporter 3 à 120 caractères." }
  if (!Object.hasOwn(PLAN, debit) || !Object.hasOwn(PLAN, credit)) return { error: "Choisissez un compte à débiter et un compte à créditer." }
  if (debit === credit) return { error: "Choisissez deux comptes différents." }
  if (montant === null || montant < 1) return { error: "Montant invalide : un entier entre 1 et " + MONTANT_MAX.toLocaleString("fr-FR") + "." }
  try {
    const numero = await db.$transaction(
      async (tx) => {
        const ctx = await ouvrirContexte(tx, etabId, session.email)
        if (ctx.derniere && date.slice(0, 7) <= ctx.derniere) throw new ErreurCompta("Cette période est clôturée : choisissez une date postérieure à " + libellePeriode(ctx.derniere) + ".")
        return poster(tx, ctx, {
          journal: journal as keyof typeof JOURNAUX,
          date,
          piece: piece || null,
          libelle,
          lignes: [
            { compte: debit, debit: montant, credit: 0 },
            { compte: credit, debit: 0, credit: montant },
          ],
        })
      },
      { timeout: 60_000, maxWait: 10_000 },
    )
    const devise = (await db.etablissement.findUnique({ where: { id: etabId }, select: { currency: true } }))?.currency ?? "XOF"
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "COMPTA_ECRITURE", entity: "EcritureCompta", entityId: etabId, details: numeroEcriture(numero) + " " + journal + " " + debit + "/" + credit + " " + formaterMontant(montant, devise) })
    rafraichir()
    return { ok: "Écriture " + numeroEcriture(numero) + " enregistrée." }
  } catch (e) {
    if (e instanceof ErreurCompta) return { error: e.message }
    console.error("Saisie d'ecriture en echec", e)
    return { error: "Enregistrement impossible, réessayez." }
  }
}

// Une ecriture ne se modifie jamais : on la contrepasse (une seule fois), a la date du jour.
export async function contrepasserAction(ecritureId: string, _etat: EtatAction, _fd: FormData): Promise<EtatAction> {
  void _etat
  void _fd
  const acces = await accesComptaEcriture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const o = await db.ecritureCompta.findFirst({ where: { id: ecritureId, etablissementId: etabId }, include: { lignes: true } })
  if (!o) return { error: "Écriture introuvable." }
  if (o.sourceType === "CONTRE") return { error: "Une contrepassation ne peut pas être contrepassée." }
  try {
    const numero = await db.$transaction(
      async (tx) => {
        const ctx = await ouvrirContexte(tx, etabId, session.email)
        return poster(tx, ctx, {
          journal: o.journal,
          date: aujourdhui(),
          piece: o.piece,
          libelle: "Contrepassation de " + numeroEcriture(o.numero) + " — " + o.libelle,
          sourceType: "CONTRE",
          sourceId: o.id,
          lignes: o.lignes.map((l) => ({ compte: l.compte, debit: l.credit, credit: l.debit })),
        })
      },
      { timeout: 60_000, maxWait: 10_000 },
    )
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "COMPTA_CONTREPASSE", entity: "EcritureCompta", entityId: o.id, details: numeroEcriture(o.numero) + " -> " + numeroEcriture(numero) })
    rafraichir()
    return { ok: "Contrepassation " + numeroEcriture(numero) + " enregistrée." }
  } catch (e) {
    if (estDoublon(e)) return { error: "Cette écriture est déjà contrepassée." }
    if (e instanceof ErreurCompta) return { error: e.message }
    console.error("Contrepassation en echec", e)
    return { error: "Contrepassation impossible, réessayez." }
  }
}

export async function cloturerAction(_etat: EtatAction, fd: FormData): Promise<EtatAction> {
  const acces = await accesComptaCloture()
  if ("erreur" in acces) return { error: acces.erreur }
  const { session, etabId } = acces
  const periode = nettoyer(fd.get("periode"))
  if (!moisValide(periode)) return { error: "Mois invalide." }
  try {
    const r = await cloturerPeriode({ etabId, periode, userEmail: session.email, aujourdhui: aujourdhui() })
    if ("erreur" in r) return { error: r.erreur }
    await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "COMPTA_CLOTURE", entity: "Etablissement", entityId: etabId, details: periode + " : " + r.ecritures + " écriture(s) comptabilisée(s) avant la clôture" })
    rafraichir()
    return { ok: "Période " + libellePeriode(periode) + " clôturée (" + r.ecritures + " écriture(s) comptabilisée(s) avant la clôture)." }
  } catch (e) {
    if (estDoublon(e)) return { error: "Cette période est déjà clôturée." }
    console.error("Cloture en echec", e)
    return { error: "Clôture impossible, réessayez." }
  }
}