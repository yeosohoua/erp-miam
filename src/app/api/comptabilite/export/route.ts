import { ecrireAudit } from "@/lib/audit"
import { libelleCompte, numeroEcriture, plageDe } from "@/lib/compta-base"
import { db } from "@/lib/db"
import { contexteEtablissement } from "@/lib/etablissement"
import { aujourdhui, versDate } from "@/lib/menus"
import { COMPTA_LECTURE, hasRole } from "@/lib/permissions"
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
  if (!session || !hasRole(session.role, COMPTA_LECTURE)) return new Response("Accès refusé.", { status: 403 })
  const { courant } = await contexteEtablissement()
  if (!courant) return new Response("Aucun établissement actif.", { status: 400 })
  const url = new URL(req.url)
  const type = url.searchParams.get("type") === "balance" ? "balance" : "journal"
  const plage = plageDe(url.searchParams.get("periode") ?? "", aujourdhui())
  const intervalle = { gte: versDate(plage.debut), lt: versDate(plage.fin) }
  const lignes: string[] = []

  if (type === "journal") {
    lignes.push(ligne(["Numero", "Date", "Journal", "Piece", "Libelle", "Compte", "Intitule du compte", "Debit", "Credit"]))
    const ecritures = await db.ecritureCompta.findMany({ where: { etablissementId: courant.id, date: intervalle }, orderBy: [{ date: "asc" }, { numero: "asc" }], take: 50_000, include: { lignes: { orderBy: { id: "asc" } } } })
    for (const e of ecritures) {
      for (const l of e.lignes) lignes.push(ligne([e.numero, e.date.toISOString().slice(0, 10), e.journal, e.piece ?? "", e.libelle, l.compte, libelleCompte(l.compte), l.debit, l.credit]))
    }
  } else {
    lignes.push(ligne(["Compte", "Intitule", "Debit", "Credit", "Solde debiteur", "Solde crediteur"]))
    const lignesBalance = await db.ecritureLigne.groupBy({ by: ["compte"], where: { ecriture: { etablissementId: courant.id, date: intervalle } }, _sum: { debit: true, credit: true }, orderBy: { compte: "asc" } })
    for (const r of lignesBalance) {
      const d = r._sum.debit ?? 0
      const c = r._sum.credit ?? 0
      lignes.push(ligne([r.compte, libelleCompte(r.compte), d, c, d > c ? d - c : 0, c > d ? c - d : 0]))
    }
  }

  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "COMPTA_EXPORT", entity: "Etablissement", entityId: courant.id, details: type + " " + plage.code + " (" + (lignes.length - 1) + " ligne(s))" })
  void numeroEcriture
  return new Response("\uFEFF" + lignes.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="' + type + "-" + plage.code + '.csv"',
      "Cache-Control": "no-store",
    },
  })
}