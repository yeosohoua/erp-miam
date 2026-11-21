import { erreur, json } from "@/lib/api-auth"
import { db } from "@/lib/db"
import { authentifierMobile } from "@/lib/mobile-auth"
import { MESSAGES_ISSUE, crediterPaiement } from "@/lib/paystack"

// Verification d'une recharge au retour dans l'app : le serveur interroge Paystack, controle devise et montant, puis credite une seule fois.
export async function POST(req: Request) {
  const a = await authentifierMobile(req)
  if (a instanceof Response) return a
  let corps: { reference?: unknown } = {}
  try {
    corps = await req.json()
  } catch {
    return erreur(400, "Corps JSON invalide.")
  }
  const reference = typeof corps.reference === "string" ? corps.reference.slice(0, 80) : ""
  const p = await db.paiementEnLigne.findFirst({ where: { reference, userId: a.userId }, select: { inscritId: true } })
  if (!p) return erreur(404, "Paiement introuvable.")
  const issue = await crediterPaiement(reference)
  const i = await db.inscrit.findUnique({ where: { id: p.inscritId }, select: { solde: true } })
  return json({ issue, credite: issue === "CREDITE" || issue === "DEJA", enAttente: issue === "EN_ATTENTE", message: MESSAGES_ISSUE[issue], solde: i ? Number(i.solde) : null })
}