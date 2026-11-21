import { crediterPaiement, signatureValide } from "@/lib/paystack"

// Webhook Paystack : authentifie par signature HMAC, jamais par session. Le credit est reverifie aupres de Paystack.
export async function POST(req: Request) {
  const longueur = Number(req.headers.get("content-length") ?? "0")
  if (longueur > 100_000) return new Response("Corps trop volumineux", { status: 413 })
  const corps = await req.text()
  if (!(await signatureValide(corps, req.headers.get("x-paystack-signature")))) return new Response("Signature invalide", { status: 401 })
  let evenement: { event?: unknown; data?: { reference?: unknown } }
  try {
    evenement = JSON.parse(corps)
  } catch {
    return new Response("Corps invalide", { status: 400 })
  }
  if (evenement.event === "charge.success" && typeof evenement.data?.reference === "string") {
    const issue = await crediterPaiement(evenement.data.reference)
    if (issue === "INDISPONIBLE") return new Response("Reessayer plus tard", { status: 503 })
  }
  return Response.json({ ok: true })
}