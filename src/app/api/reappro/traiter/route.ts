import { timingSafeEqual } from "node:crypto"

import { ecrireAudit } from "@/lib/audit"
import { valeurConfig } from "@/lib/config"
import { db } from "@/lib/db"
import { genererBonsReappro } from "@/lib/reappro"

// Appel planifie (cron, tache Windows), authentifie par CRON_SECRET (16 caracteres minimum), jamais par une session.
// Cree ou complete des bons en BROUILLON pour chaque etablissement actif (ou un seul avec ?etablissement=). Rien n'est envoye aux fournisseurs.
export async function POST(req: Request) {
  const secret = await valeurConfig("CRON_SECRET")
  if (secret.length < 16) return new Response("Désactivé", { status: 404 })
  const a = Buffer.from(req.headers.get("x-cron-secret") ?? "")
  const b = Buffer.from(secret)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Non autorisé", { status: 401 })
  const cible = new URL(req.url).searchParams.get("etablissement")
  const etabs = await db.etablissement.findMany({ where: { active: true, ...(cible ? { id: cible } : {}) }, select: { id: true } })
  let bons = 0
  let lignes = 0
  let sansFournisseur = 0
  for (const e of etabs) {
    try {
      const r = await genererBonsReappro(e.id)
      bons += r.bons
      lignes += r.lignes
      sansFournisseur += r.sansFournisseur
      if (r.bons > 0) await ecrireAudit({ userEmail: "planificateur", action: "REAPPRO_AUTO", entity: "Etablissement", entityId: e.id, details: r.bons + " bon(s), " + r.lignes + " ligne(s)" })
    } catch (erreur) {
      console.error("Reapprovisionnement automatique en echec", e.id, erreur)
    }
  }
  return Response.json({ etablissements: etabs.length, bons, lignes, sansFournisseur })
}