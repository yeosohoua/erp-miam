import "server-only"

import { LIGNES_MAX, TOTAL_MAX, numeroTicket, totalPanier, type LignePanier, type ModeCaisse } from "@/lib/caisse-base"
import { db } from "@/lib/db"

class Refus extends Error {}

export type ResultatVente = { erreur: string } | { ok: true; numero: number; total: number; solde: number | null; rendu: number | null; deja?: boolean }

// Encaisse une vente. Tout se passe dans une transaction verrouillee par etablissement :
// prix relus en base, solde debite de maniere conditionnelle (jamais negatif), numerotation continue.
export async function encaisser(o: { etabId: string; userEmail: string; lignes: LignePanier[]; mode: ModeCaisse; identifiant: string; visiteur: string; recu?: number | null; remisePct?: number; partCompte?: number; cle?: string; at?: Date; prix?: Record<string, number> }): Promise<ResultatVente> {
  try {
    return await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"caisse:" + o.etabId}))::text AS v`
        if (o.cle) {
          const existante = await tx.venteComptoir.findFirst({ where: { etablissementId: o.etabId, cleHorsLigne: o.cle }, select: { numero: true, total: true } })
          if (existante) return { ok: true as const, numero: existante.numero, total: existante.total, solde: null, rendu: null, deja: true }
        }
        if (o.lignes.length === 0 || o.lignes.length > LIGNES_MAX) throw new Refus("Panier invalide.")
        const articles = await tx.articleCarte.findMany({ where: { etablissementId: o.etabId, ...(o.prix ? {} : { active: true }), id: { in: o.lignes.map((l) => l.articleId) } } })
        if (articles.length !== o.lignes.length) throw new Refus("Un article n'est plus disponible : actualisez la caisse.")
        const parId = new Map(articles.map((a) => [a.id, a]))
        const detail = o.lignes.map((l) => {
          const a = parId.get(l.articleId)!
          const px = o.prix?.[a.id] ?? a.prix
          return { articleId: a.id, libelle: a.nom, quantite: l.quantite, prixUnitaire: px, montant: px * l.quantite }
        })
        const brut = totalPanier(detail)
        const pct = o.remisePct ?? 0
        if (!Number.isInteger(pct) || pct < 0 || pct > 100) throw new Refus("Remise invalide : un pourcentage entier entre 0 et 100.")
        const remise = Math.round((brut * pct) / 100)
        const total = brut - remise
        if (total <= 0 || total > TOTAL_MAX) throw new Refus("Montant invalide.")
        const sessionEnCours = await tx.sessionCaisse.findFirst({ where: { etablissementId: o.etabId, caissierEmail: o.userEmail, statut: "OUVERTE" }, select: { id: true } })
        if (!sessionEnCours) {
          const reglage = await tx.etablissement.findUnique({ where: { id: o.etabId }, select: { sessionCaisseObligatoire: true } })
          if (reglage?.sessionCaisseObligatoire) throw new Refus("Ouvrez votre caisse avant d'encaisser.")
        }
        const part = o.mode !== "COMPTE" ? (o.partCompte ?? 0) : 0
        if (!Number.isInteger(part) || part < 0) throw new Refus("Part sur compte invalide.")
        if (part > 0 && part >= total) throw new Refus("La part sur compte doit être inférieure au total : choisissez le paiement sur compte.")
        const debit = o.mode === "COMPTE" ? total : part
        const aRegler = total - part
        const recuCash = o.mode === "CASH" && o.recu != null ? o.recu : null
        if (recuCash !== null && recuCash < aRegler) throw new Refus("Le montant reçu est inférieur au montant à régler.")

        let inscritId: string | null = null
        if (o.mode === "COMPTE" || part > 0) {
          const code = o.identifiant.trim()
          if (!code) throw new Refus("Scannez le badge ou saisissez le matricule.")
          const inscrit = await tx.inscrit.findFirst({ where: { etablissementId: o.etabId, OR: [{ badge: code }, { matricule: code }] }, select: { id: true, statut: true } })
          if (!inscrit) throw new Refus("Inscrit introuvable.")
          if (inscrit.statut !== "ACTIVE") throw new Refus("Ce compte n'est pas actif.")
          const maj = await tx.inscrit.updateMany({ where: { id: inscrit.id, solde: { gte: debit } }, data: { solde: { decrement: debit } } })
          if (maj.count === 0) throw new Refus("Solde insuffisant.")
          inscritId = inscrit.id
        }

        const max = await tx.venteComptoir.aggregate({ where: { etablissementId: o.etabId }, _max: { numero: true } })
        const numero = (max._max.numero ?? 0) + 1
        await tx.venteComptoir.create({
          data: {
            etablissementId: o.etabId,
            numero,
            statut: "PAYEE",
            cleHorsLigne: o.cle ?? null,
            ...(o.at ? { createdAt: o.at } : {}),
            methode: o.mode === "COMPTE" ? null : o.mode,
            inscritId,
            visiteur: o.mode === "COMPTE" ? null : o.visiteur.trim().slice(0, 60) || null,
            total,
            createdBy: o.userEmail,
            remise,
            partCompte: part,
            sessionId: sessionEnCours?.id ?? null,
            recu: recuCash,
            lignes: { create: detail },
          },
        })
        let solde: number | null = null
        if (inscritId) {
          await tx.transaction.create({ data: { etablissementId: o.etabId, inscritId, type: "DEBIT", montant: -debit, reference: "CAISSE-" + numero, note: "Caisse " + numeroTicket(numero), createdBy: o.userEmail } })
          solde = (await tx.inscrit.findUniqueOrThrow({ where: { id: inscritId }, select: { solde: true } })).solde
        }
        return { ok: true as const, numero, total, solde, rendu: recuCash !== null ? recuCash - aRegler : null }
      },
      { timeout: 20_000, maxWait: 10_000 },
    )
  } catch (e) {
    if (e instanceof Refus) return { erreur: e.message }
    console.error("Encaissement en echec", e)
    return { erreur: "Encaissement impossible, réessayez." }
  }
}

// Annule une vente payee : un compte prepaye est rembourse, une vente en especes ou Mobile Money est contrepassee en comptabilite.
export async function annulerVenteComptoir(o: { etabId: string; userEmail: string; venteId: string }): Promise<{ erreur: string } | { ok: true; numero: number; total: number }> {
  try {
    return await db.$transaction(async (tx) => {
      const avant = await tx.venteComptoir.findFirst({ where: { id: o.venteId, etablissementId: o.etabId }, select: { session: { select: { statut: true } } } })
      if (avant?.session?.statut === "CLOTUREE") throw new Refus("Cette vente appartient à une caisse clôturée : elle ne peut plus être annulée.")
      if ((await tx.venteRemboursement.count({ where: { venteId: o.venteId } })) > 0) throw new Refus("Cette vente a déjà été remboursée en partie : elle ne peut plus être annulée.")
      const m = await tx.venteComptoir.updateMany({ where: { id: o.venteId, etablissementId: o.etabId, statut: "PAYEE" }, data: { statut: "ANNULEE", annuleeLe: new Date(), annuleePar: o.userEmail } })
      if (m.count === 0) throw new Refus("Vente introuvable ou déjà annulée.")
      const v = await tx.venteComptoir.findUniqueOrThrow({ where: { id: o.venteId } })
      if (v.inscritId && (v.methode === null || v.partCompte > 0)) {
        await tx.inscrit.update({ where: { id: v.inscritId }, data: { solde: { increment: v.methode === null ? v.total : v.partCompte } } })
        await tx.transaction.create({ data: { etablissementId: o.etabId, inscritId: v.inscritId, type: "REFUND", montant: v.methode === null ? v.total : v.partCompte, reference: "CAISSE-" + v.numero + "-ANNUL", note: "Annulation " + numeroTicket(v.numero), createdBy: o.userEmail } })
      }
      return { ok: true as const, numero: v.numero, total: v.total }
    })
  } catch (e) {
    if (e instanceof Refus) return { erreur: e.message }
    console.error("Annulation de vente en echec", e)
    return { erreur: "Annulation impossible, réessayez." }
  }
}