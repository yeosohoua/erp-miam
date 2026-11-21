import { erreur, json } from "@/lib/api-auth"
import { ecrireAudit } from "@/lib/audit"
import { valeurConfig } from "@/lib/config"
import { db } from "@/lib/db"
import { formaterMontant } from "@/lib/menus"
import { choisirFiche } from "@/lib/mobile-acces"
import { authentifierMobile } from "@/lib/mobile-auth"
import { RECHARGE_MAX, RECHARGE_MIN, initialiserPaiement, nouvelleReference, paystackConfigure } from "@/lib/paystack"

async function urlBase(req: Request): Promise<string> {
  const configuree = (await valeurConfig("APP_URL")).replace(/\/+$/, "")
  if (configuree) return configuree
  return (req.headers.get("x-forwarded-proto") ?? "http") + "://" + (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3001")
}

// Recharge par Paystack : cree la demande puis renvoie l'adresse de paiement. Le credit n'a lieu qu'apres verification serveur.
export async function POST(req: Request) {
  const a = await authentifierMobile(req)
  if (a instanceof Response) return a
  let corps: { inscritId?: unknown; montant?: unknown } = {}
  try {
    corps = await req.json()
  } catch {
    return erreur(400, "Corps JSON invalide.")
  }
  const f = await choisirFiche(a, typeof corps.inscritId === "string" ? corps.inscritId : null)
  if (f instanceof Response) return f
  if (!(await paystackConfigure())) return erreur(503, "Le paiement en ligne n'est pas encore activé. Rechargez auprès du caissier.")
  if (!f.etab.prepaye) return erreur(403, "Le compte prépayé n'est pas activé dans cet établissement.")
  if (f.statut !== "ACTIVE") return erreur(403, "Ce compte n'est pas actif.")
  const montant = typeof corps.montant === "number" && Number.isInteger(corps.montant) ? corps.montant : NaN
  if (!(montant >= RECHARGE_MIN && montant <= RECHARGE_MAX)) {
    return erreur(400, "Montant invalide : entre " + formaterMontant(RECHARGE_MIN, f.etab.currency) + " et " + formaterMontant(RECHARGE_MAX, f.etab.currency) + ".")
  }
  // Les comptes connectes par code ont une adresse technique en .local, que Paystack peut refuser : adresse de repli.
  const email = a.email && !a.email.toLowerCase().endsWith(".local") ? a.email : process.env.PAYSTACK_EMAIL_DEFAUT || "paiements@miam-cantine.com"
  const reference = nouvelleReference()
  await db.paiementEnLigne.create({ data: { etablissementId: f.etablissementId, inscritId: f.id, userId: a.userId, userEmail: email, reference, montant } })
  const r = await initialiserPaiement({ email, montant, reference, callbackUrl: (await urlBase(req)) + "/api/paystack/retour", metadata: { inscritId: f.id, matricule: f.matricule } })
  if ("erreur" in r) {
    await db.paiementEnLigne.update({ where: { reference }, data: { statut: "FAILED" } })
    return erreur(502, r.erreur)
  }
  await ecrireAudit({ userId: a.userId, userEmail: a.email, action: "PAIEMENT_PAYSTACK_INIT", entity: "Inscrit", entityId: f.id, details: f.matricule + " " + montant + " " + reference + " (mobile)" })
  return json({ url: r.url, reference })
}