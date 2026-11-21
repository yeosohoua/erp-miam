import { timingSafeEqual } from "node:crypto"

import { ecrireAudit } from "@/lib/audit"
import { comptabiliser } from "@/lib/compta"
import { valeurConfig } from "@/lib/config"
import { db } from "@/lib/db"
import { reessayer } from "@/lib/notifications"

const PLANIFICATEUR = "planificateur"

// Comptabilise les pieces en attente de chaque etablissement actif (ou d'un seul si "etablissement" est fourni).
async function comptabiliserTout(cible: string | null): Promise<{ etablissements: number; ecritures: number; echecs: number }> {
  const etabs = await db.etablissement.findMany({ where: { active: true, ...(cible ? { id: cible } : {}) }, select: { id: true } })
  let ecritures = 0
  let echecs = 0
  for (const e of etabs) {
    try {
      const r = await comptabiliser({ etabId: e.id, userEmail: PLANIFICATEUR })
      if (r.ecritures > 0) {
        ecritures += r.ecritures
        await ecrireAudit({ userEmail: PLANIFICATEUR, action: "COMPTA_AUTO", entity: "Etablissement", entityId: e.id, details: r.ecritures + " écriture(s), total " + r.total })
      }
    } catch (erreur) {
      echecs += 1
      console.error("Comptabilisation automatique en echec", e.id, erreur)
    }
  }
  return { etablissements: etabs.length, ecritures, echecs }
}

// Appel planifie (cron, tache Windows, service externe), authentifie par le secret CRON_SECRET (16 caracteres minimum), jamais par une session.
// Sans parametre : relance les messages en attente ou en echec. ?tache=comptabilite : comptabilise les pieces en attente. ?tache=tout : les deux.
export async function POST(req: Request) {
  const secret = await valeurConfig("CRON_SECRET")
  if (secret.length < 16) return new Response("Désactivé", { status: 404 })
  const a = Buffer.from(req.headers.get("x-cron-secret") ?? "")
  const b = Buffer.from(secret)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Non autorisé", { status: 401 })
  const url = new URL(req.url)
  const tache = url.searchParams.get("tache") ?? "notifications"
  if (tache === "notifications") return Response.json(await reessayer({ forcer: false }))
  if (tache !== "comptabilite" && tache !== "tout") return new Response("Tâche inconnue", { status: 400 })
  const notifications = tache === "tout" ? await reessayer({ forcer: false }) : null
  const comptabilite = await comptabiliserTout(url.searchParams.get("etablissement"))
  return Response.json({ notifications, comptabilite })
}