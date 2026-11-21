import { erreur } from "@/lib/api-auth"
import { choisirFiche } from "@/lib/mobile-acces"
import type { AuthMobile } from "@/lib/mobile-auth"

// Etablissement dont le catalogue est servi : celui de la fiche (parent/eleve),
// ou le premier etablissement de l'employe.
export async function etablissementCatalogue(a: AuthMobile, req: Request): Promise<string | Response> {
  if (a.role === "EMPLOYE") {
    return a.etabIds[0] ?? erreur(403, "Aucun établissement rattaché.")
  }
  const f = await choisirFiche(a, new URL(req.url).searchParams.get("inscritId"))
  if (f instanceof Response) return f
  return f.etablissementId
}

export const urlImage = (id: string | null): string | null => (id ? "/api/mobile/v1/images/" + id : null)