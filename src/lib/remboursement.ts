import "server-only"

import { numeroTicket } from "@/lib/caisse-base"
import { db } from "@/lib/db"

class Refus extends Error {}

export type ResultatRemboursement = { erreur: string } | { ok: true; numero: number; montant: number; reste: number }

// Rembourse une partie d'une vente payee. Compte prepaye : le solde est recredite. Especes / Mobile Money : la comptabilite contrepasse la part remboursee.
export async function rembourserVenteComptoir(o: { etabId: string; userEmail: string; venteId: string; montant: number; motif: string }): Promise<ResultatRemboursement> {
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"caisse:" + o.etabId}))::text AS v`
      const v = await tx.venteComptoir.findFirst({ where: { id: o.venteId, etablissementId: o.etabId }, include: { remboursements: { select: { montant: true } } } })
      if (!v || v.statut !== "PAYEE") throw new Refus("Vente introuvable ou annulée.")
      if (v.partCompte > 0) throw new Refus("Paiement mixte : le remboursement partiel n'est pas disponible, annulez le ticket.")
      const deja = v.remboursements.reduce((s, r) => s + r.montant, 0)
      const reste = v.total - deja
      if (!Number.isInteger(o.montant) || o.montant < 1 || o.montant > reste) throw new Refus("Montant invalide : entre 1 et " + reste + " FCFA remboursables.")
      const session = await tx.sessionCaisse.findFirst({ where: { etablissementId: o.etabId, caissierEmail: o.userEmail, statut: "OUVERTE" }, select: { id: true } })
      await tx.venteRemboursement.create({ data: { etablissementId: o.etabId, venteId: v.id, montant: o.montant, motif: o.motif, createdBy: o.userEmail, sessionId: session?.id ?? null } })
      if (v.inscritId && v.methode === null) {
        await tx.inscrit.update({ where: { id: v.inscritId }, data: { solde: { increment: o.montant } } })
        await tx.transaction.create({ data: { etablissementId: o.etabId, inscritId: v.inscritId, type: "REFUND", montant: o.montant, reference: "CAISSE-" + v.numero + "-REMB-" + (v.remboursements.length + 1), note: "Remboursement partiel " + numeroTicket(v.numero), createdBy: o.userEmail } })
      }
      return { ok: true as const, numero: v.numero, montant: o.montant, reste: reste - o.montant }
    })
  } catch (e) {
    if (e instanceof Refus) return { erreur: e.message }
    console.error("Remboursement en echec", e)
    return { erreur: "Remboursement impossible, réessayez." }
  }
}