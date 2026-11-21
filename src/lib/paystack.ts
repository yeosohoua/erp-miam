import "server-only"

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

import { after } from "next/server"

import { ecrireAudit } from "@/lib/audit"
import { valeurConfig } from "@/lib/config"
import { db } from "@/lib/db"
import { notifierRecharge } from "@/lib/notifications"

export const RECHARGE_MIN = 500
export const RECHARGE_MAX = 500_000

const cleSecrete = (): Promise<string> => valeurConfig("PAYSTACK_SECRET_KEY")
const urlApi = (): string => (process.env.PAYSTACK_API_URL || "https://api.paystack.co").replace(/\/+$/, "")
export const paystackConfigure = async (): Promise<boolean> => (await cleSecrete()).length > 0

// Documentation Paystack : pour le XOF, le montant est multiplie par 100 meme sans sous-unite.
export async function facteurXof(): Promise<number> {
  const n = Number(await valeurConfig("PAYSTACK_XOF_FACTOR"))
  return Number.isInteger(n) && n >= 1 ? n : 100
}

export const nouvelleReference = (): string => "MIAM" + Date.now().toString(36).toUpperCase() + randomBytes(5).toString("hex").toUpperCase()

async function appel(chemin: string, init?: { method: string; corps?: unknown }): Promise<{ http: number; json: Record<string, unknown> | null }> {
  const res = await fetch(urlApi() + chemin, {
    method: init?.method ?? "GET",
    headers: { Authorization: "Bearer " + (await cleSecrete()), "Content-Type": "application/json" },
    body: init?.corps === undefined ? undefined : JSON.stringify(init.corps),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  })
  let json: Record<string, unknown> | null = null
  try {
    json = (await res.json()) as Record<string, unknown>
  } catch {
    json = null
  }
  return { http: res.status, json }
}

export async function initialiserPaiement(o: { email: string; montant: number; reference: string; callbackUrl: string; metadata: Record<string, string> }): Promise<{ url: string } | { erreur: string }> {
  try {
    const { http, json } = await appel("/transaction/initialize", {
      method: "POST",
      corps: { email: o.email, amount: o.montant * (await facteurXof()), currency: "XOF", reference: o.reference, callback_url: o.callbackUrl, metadata: o.metadata },
    })
    const data = json?.data as { authorization_url?: unknown } | undefined
    if (http >= 200 && http < 300 && json?.status === true && typeof data?.authorization_url === "string" && /^https?:\/\//.test(data.authorization_url)) {
      return { url: data.authorization_url }
    }
    console.error("Paystack initialize refuse", http, json?.message)
    return { erreur: "Le service de paiement a refusé la demande." }
  } catch (e) {
    console.error("Paystack initialize indisponible", e)
    return { erreur: "Le service de paiement est injoignable, réessayez." }
  }
}

type Verification = { statut: string; montant: number; devise: string; canal: string | null }

// null = Paystack injoignable ou reponse inexploitable ; statut "introuvable" = transaction jamais ouverte.
async function verifierTransaction(reference: string): Promise<Verification | null> {
  try {
    const { http, json } = await appel("/transaction/verify/" + encodeURIComponent(reference))
    if (http === 404) return { statut: "introuvable", montant: 0, devise: "", canal: null }
    const d = json?.data as Record<string, unknown> | undefined
    if (http < 200 || http >= 300 || json?.status !== true || !d) return null
    return { statut: String(d.status ?? ""), montant: Number(d.amount ?? 0), devise: String(d.currency ?? ""), canal: typeof d.channel === "string" ? d.channel : null }
  } catch (e) {
    console.error("Paystack verify indisponible", e)
    return null
  }
}

// En-tete x-paystack-signature : HMAC SHA-512 du corps brut, cle = cle secrete.
export async function signatureValide(corps: string, signature: string | null): Promise<boolean> {
  const cle = await cleSecrete()
  if (!cle || !signature) return false
  const attendu = Buffer.from(createHmac("sha512", cle).update(corps).digest("hex"))
  const recu = Buffer.from(signature)
  return attendu.length === recu.length && timingSafeEqual(attendu, recu)
}

export type IssueCredit = "CREDITE" | "DEJA" | "INCONNU" | "EN_ATTENTE" | "ECHEC" | "INCOHERENT" | "INDISPONIBLE"

export const MESSAGES_ISSUE: Record<IssueCredit, string> = {
  CREDITE: "Paiement confirmé : le compte a été crédité.",
  DEJA: "Ce paiement a déjà été pris en compte.",
  EN_ATTENTE: "Paiement en attente de confirmation par Paystack. Réessayez dans quelques instants.",
  ECHEC: "Le paiement a échoué ou a été annulé. Aucun montant n'a été crédité.",
  INCOHERENT: "Le montant confirmé ne correspond pas à la demande : aucun crédit effectué. Contactez l'établissement.",
  INCONNU: "Paiement introuvable.",
  INDISPONIBLE: "Impossible de joindre Paystack pour le moment. Réessayez.",
}

// Le serveur ne fait jamais confiance a l'appelant (retour navigateur ou webhook) : il interroge Paystack,
// controle devise et montant, puis credite une seule fois (transition PENDING -> SUCCESS dans la meme transaction).
export async function crediterPaiement(reference: string): Promise<IssueCredit> {
  const p = await db.paiementEnLigne.findUnique({ where: { reference }, include: { inscrit: { select: { matricule: true } } } })
  if (!p) return "INCONNU"
  if (p.statut === "SUCCESS") return "DEJA"
  const v = await verifierTransaction(reference)
  if (!v) return "INDISPONIBLE"
  if (v.statut === "failed" || v.statut === "reversed") {
    await db.paiementEnLigne.updateMany({ where: { id: p.id, statut: "PENDING" }, data: { statut: "FAILED" } })
    return "ECHEC"
  }
  if (v.statut !== "success") return "EN_ATTENTE"
  const attendu = p.montant * (await facteurXof())
  if (v.devise !== "XOF" || v.montant !== attendu) {
    await ecrireAudit({ action: "PAIEMENT_PAYSTACK_INCOHERENT", entity: "Inscrit", entityId: p.inscritId, details: reference + " attendu " + attendu + " XOF, recu " + v.montant + " " + v.devise })
    return "INCOHERENT"
  }
  try {
    const credite = await db.$transaction(async (tx) => {
      const m = await tx.paiementEnLigne.updateMany({ where: { id: p.id, statut: { in: ["PENDING", "FAILED"] } }, data: { statut: "SUCCESS", creditedAt: new Date(), canal: v.canal } })
      if (m.count === 0) return false
      await tx.transaction.create({
        data: {
          etablissementId: p.etablissementId,
          inscritId: p.inscritId,
          type: "TOPUP",
          methode: "PAYSTACK",
          montant: p.montant,
          reference: p.reference,
          note: "Recharge en ligne" + (v.canal ? " (" + v.canal + ")" : ""),
          createdBy: p.userEmail,
        },
      })
      await tx.inscrit.update({ where: { id: p.inscritId }, data: { solde: { increment: p.montant } } })
      return true
    })
    if (!credite) return "DEJA"
    await ecrireAudit({ userId: p.userId, userEmail: p.userEmail, action: "PAIEMENT_PAYSTACK", entity: "Inscrit", entityId: p.inscritId, details: p.inscrit.matricule + " +" + p.montant + " " + reference })
    after(() => notifierRecharge(p.inscritId, p.montant))
    return "CREDITE"
  } catch (e) {
    console.error("Credit Paystack en echec", e)
    return "INDISPONIBLE"
  }
}