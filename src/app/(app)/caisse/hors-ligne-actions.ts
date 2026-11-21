"use server"

import { revalidatePath } from "next/cache"

import { ecrireAudit } from "@/lib/audit"
import { accesCaisse, accesCaisseVente } from "@/lib/caisse-acces"
import { LIGNES_MAX, QTE_MAX, modeValide, numeroTicket } from "@/lib/caisse-base"
import { encaisser } from "@/lib/caisse"
import type { IssueVente, RetourSyncVentes } from "@/lib/caisse-hors-ligne-base"

const CLE = /^[A-Za-z0-9-]{8,64}$/

// Rejoue les ventes faites hors ligne (especes / Mobile Money). Chaque vente porte une cle unique : jamais de doublon.
export async function synchroniserVentes(json: string): Promise<RetourSyncVentes> {
  const a = await accesCaisseVente()
  if ("erreur" in a) return { erreur: a.erreur }
  if (typeof json !== "string" || json.length > 300_000) return { erreur: "Envoi trop volumineux." }
  let brut: unknown
  try {
    brut = JSON.parse(json)
  } catch {
    return { erreur: "Données illisibles." }
  }
  if (!Array.isArray(brut) || brut.length > 100) return { erreur: "Données invalides." }
  const gestionnaire = await accesCaisse()
  const peutRemise = !!gestionnaire && gestionnaire.config
  const issues: IssueVente[] = []
  const maintenant = Date.now()
  let nouvelles = 0

  for (const x of brut) {
    const v = (typeof x === "object" && x !== null ? x : {}) as Record<string, unknown>
    if (typeof v.cle !== "string" || !CLE.test(v.cle)) continue
    const cle = v.cle
    const refus = (erreur: string): void => {
      issues.push({ cle, ok: false, erreur, reessayer: false })
    }
    const at = typeof v.at === "number" && Number.isFinite(v.at) ? v.at : NaN
    if (!(at <= maintenant + 5 * 60_000 && at >= maintenant - 14 * 86_400_000)) {
      refus("Date de la vente invalide.")
      continue
    }
    if (!modeValide(v.mode) || v.mode === "COMPTE") {
      refus("Mode de paiement non accepté hors ligne.")
      continue
    }
    const brutes = Array.isArray(v.lignes) ? v.lignes : []
    if (brutes.length === 0 || brutes.length > LIGNES_MAX) {
      refus("Panier invalide.")
      continue
    }
    const lignes: { articleId: string; quantite: number }[] = []
    const prix: Record<string, number> = {}
    let valide = true
    for (const l of brutes) {
      const o = (typeof l === "object" && l !== null ? l : {}) as Record<string, unknown>
      const q = o.quantite
      const p = o.prix
      if (typeof o.articleId !== "string" || typeof q !== "number" || !Number.isInteger(q) || q < 1 || q > QTE_MAX || typeof p !== "number" || !Number.isInteger(p) || p < 1 || p > 1_000_000 || o.articleId in prix) {
        valide = false
        break
      }
      lignes.push({ articleId: o.articleId, quantite: q })
      prix[o.articleId] = p
    }
    if (!valide) {
      refus("Panier invalide.")
      continue
    }
    const pct = typeof v.pct === "number" && Number.isInteger(v.pct) && v.pct >= 0 && v.pct <= 100 ? v.pct : 0
    if (pct > 0 && !peutRemise) {
      refus("Remise non autorisée pour ce compte.")
      continue
    }
    const recu = typeof v.recu === "number" && Number.isInteger(v.recu) && v.recu >= 0 && v.recu <= 1_000_000_000 ? v.recu : null
    const visiteur = typeof v.visiteur === "string" ? v.visiteur.slice(0, 60) : ""
    const r = await encaisser({ etabId: a.etabId, userEmail: a.session.email, lignes, mode: v.mode, identifiant: "", visiteur, recu, remisePct: pct, cle, at: new Date(at), prix })
    if ("erreur" in r) {
      issues.push({ cle, ok: false, erreur: r.erreur, reessayer: r.erreur.startsWith("Ouvrez votre caisse") })
      continue
    }
    issues.push({ cle, ok: true, numero: r.numero })
    if (!r.deja) {
      nouvelles += 1
      await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "VENTE_HORS_LIGNE", entity: "VenteComptoir", entityId: String(r.numero), details: `${numeroTicket(r.numero)} ${r.total}` })
    }
  }
  if (nouvelles > 0) {
    revalidatePath("/caisse", "layout")
    revalidatePath("/analytics", "layout")
    revalidatePath("/", "layout")
  }
  return { issues }
}