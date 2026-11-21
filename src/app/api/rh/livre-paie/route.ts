import { ecrireAudit } from "@/lib/audit"
import { moisValide } from "@/lib/compta-base"
import { db } from "@/lib/db"
import { contexteEtablissement } from "@/lib/etablissement"
import { aujourdhui } from "@/lib/menus"
import { PAIE_LECTURE, hasRole } from "@/lib/permissions"
import { getSession } from "@/lib/session"

// Neutralise l'injection de formules (Excel, Sheets) : un texte commencant par = + - @ est precede d'une apostrophe.
function cellule(v: string | number): string {
  if (typeof v === "number") return String(v)
  const s = /^[=+\-@\t\r]/.test(v) ? "'" + v : v
  return '"' + s.replace(/"/g, '""') + '"'
}
const ligne = (cols: (string | number)[]): string => cols.map(cellule).join(";")

export async function GET(req: Request): Promise<Response> {
  const session = await getSession()
  if (!session || !hasRole(session.role, PAIE_LECTURE)) return new Response("Accès refusé.", { status: 403 })
  const { courant } = await contexteEtablissement()
  if (!courant) return new Response("Aucun établissement actif.", { status: 400 })
  const periode = new URL(req.url).searchParams.get("periode") ?? aujourdhui().slice(0, 7)
  if (!moisValide(periode)) return new Response("Mois invalide.", { status: 400 })

  const bulletins = await db.bulletinPaie.findMany({ where: { etablissementId: courant.id, periode }, include: { employe: { select: { matricule: true, firstName: true, lastName: true } } }, orderBy: { employe: { matricule: "asc" } }, take: 5000 })
  const lignes: string[] = [ligne(["Matricule", "Nom", "Prenom", "Statut", "Brut", "Retraite salarie", "CMU salarie", "ITS", "Net a payer", "Retraite patronale", "Prestations familiales", "Maternite", "Accident du travail", "CMU patronale", "Taxes patronales", "Cout employeur"])]
  const tot = { brut: 0, rs: 0, cs: 0, its: 0, net: 0, rp: 0, pf: 0, mat: 0, at: 0, cp: 0, tp: 0, cout: 0 }
  for (const b of bulletins) {
    lignes.push(ligne([b.employe.matricule, b.employe.lastName, b.employe.firstName, b.statut === "VALIDATED" ? "Valide" : "Brouillon", b.brut, b.retraiteSalarie, b.cmuSalarie, b.its, b.net, b.retraitePatronale, b.pf, b.maternite, b.at, b.cmuPatronale, b.taxesPatronales, b.coutEmployeur]))
    tot.brut += b.brut
    tot.rs += b.retraiteSalarie
    tot.cs += b.cmuSalarie
    tot.its += b.its
    tot.net += b.net
    tot.rp += b.retraitePatronale
    tot.pf += b.pf
    tot.mat += b.maternite
    tot.at += b.at
    tot.cp += b.cmuPatronale
    tot.tp += b.taxesPatronales
    tot.cout += b.coutEmployeur
  }
  lignes.push(ligne(["Total", "", "", "", tot.brut, tot.rs, tot.cs, tot.its, tot.net, tot.rp, tot.pf, tot.mat, tot.at, tot.cp, tot.tp, tot.cout]))

  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "PAIE_EXPORT", entity: "Etablissement", entityId: courant.id, details: "livre de paie " + periode + " (" + bulletins.length + " bulletin(s))" })
  return new Response("\uFEFF" + lignes.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="livre-paie-' + periode + '.csv"',
      "Cache-Control": "no-store",
    },
  })
}