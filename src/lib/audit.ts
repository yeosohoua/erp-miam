import "server-only"

import { headers } from "next/headers"

import { db } from "@/lib/db"

export type AuditEntree = {
  userId?: string | null
  userEmail?: string | null
  action: string
  entity?: string
  entityId?: string
  details?: string
}

async function adresseIp(): Promise<string | null> {
  try {
    const h = await headers()
    const transfere = h.get("x-forwarded-for")
    if (transfere) return transfere.split(",")[0].trim().slice(0, 64)
    return h.get("x-real-ip")?.slice(0, 64) ?? null
  } catch {
    return null
  }
}

// Ne leve jamais d'erreur : un echec d'ecriture du journal ne doit pas bloquer l'action de l'utilisateur.
export async function ecrireAudit(e: AuditEntree): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: e.userId ?? null,
        userEmail: e.userEmail ? e.userEmail.slice(0, 120) : null,
        action: e.action,
        entity: e.entity ?? null,
        entityId: e.entityId ?? null,
        details: e.details ? e.details.slice(0, 500) : null,
        ip: await adresseIp(),
      },
    })
  } catch (erreur) {
    console.error("Audit : écriture impossible", erreur)
  }
}