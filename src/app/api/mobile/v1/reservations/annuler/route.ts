import { erreur, json } from "@/lib/api-auth"
import { annulerRepas, choisirFiche } from "@/lib/mobile-acces"
import { authentifierMobile } from "@/lib/mobile-auth"

export async function POST(req: Request) {
  const a = await authentifierMobile(req)
  if (a instanceof Response) return a
  let corps: { inscritId?: unknown; date?: unknown; service?: unknown } = {}
  try {
    corps = await req.json()
  } catch {
    return erreur(400, "Corps JSON invalide.")
  }
  const f = await choisirFiche(a, typeof corps.inscritId === "string" ? corps.inscritId : null)
  if (f instanceof Response) return f
  const r = await annulerRepas(f, a, typeof corps.date === "string" ? corps.date : "", typeof corps.service === "string" ? corps.service : "")
  if ("erreur" in r) return erreur(r.status, r.erreur)
  return json({ ok: r.ok })
}