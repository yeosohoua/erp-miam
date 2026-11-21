import "server-only"

import type { Prisma } from "@/generated/prisma/client"

type Client = Prisma.TransactionClient

// Mouvements d'especes d'une session hors ventes : recharges au guichet (+) et remboursements en especes (-).
export async function mouvementsEspeces(c: Client, s: { id: string; etablissementId: string; caissierEmail: string; ouverteLe: Date; clotureeLe: Date | null }): Promise<number> {
  const fin = s.clotureeLe ?? new Date()
  const recharges = await c.transaction.aggregate({
    where: { etablissementId: s.etablissementId, type: "TOPUP", methode: "CASH", createdBy: s.caissierEmail, createdAt: { gte: s.ouverteLe, lte: fin } },
    _sum: { montant: true },
  })
  const rembours = await c.venteRemboursement.aggregate({ where: { sessionId: s.id, vente: { methode: "CASH" } }, _sum: { montant: true } })
  return (recharges._sum.montant ?? 0) - (rembours._sum.montant ?? 0)
}