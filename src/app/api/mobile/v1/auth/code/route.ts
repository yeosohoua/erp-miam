import { erreur, json } from "@/lib/api-auth"
import { connecterParCode } from "@/lib/mobile-connexion"
import { DUREE_JETON_MOBILE, signerJetonMobile } from "@/lib/mobile-auth"

function adresseIp(req: Request): string {
  const t = req.headers.get("x-forwarded-for")
  if (t) return t.split(",")[0].trim().slice(0, 64)
  return req.headers.get("x-real-ip")?.slice(0, 64) ?? "inconnue"
}

// Connexion de l'app mobile : code d'acces a 5 caracteres (l'etablissement est facultatif, il se deduit du code).
export async function POST(req: Request) {
  let corps: { etab?: unknown; code?: unknown } = {}
  try {
    corps = await req.json()
  } catch {
    return erreur(400, "Corps JSON invalide.")
  }
  const etab = typeof corps.etab === "string" ? corps.etab : ""
  const code = typeof corps.code === "string" ? corps.code : ""
  const r = await connecterParCode(etab, code, adresseIp(req))
  if ("erreur" in r) return erreur(r.status, r.erreur)
  const token = await signerJetonMobile(r.user.id, r.user.tokenVersion)
  return json({ token, expiresIn: DUREE_JETON_MOBILE, role: r.user.role, name: r.user.name, cible: r.cible, etablissement: r.etablissement })
}