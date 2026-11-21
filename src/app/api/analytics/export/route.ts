import { NextResponse } from "next/server"

import { VUES, avecFinance, periodeAnalytics, versCsv, vuesPour, type TableExport } from "@/lib/analytics-base"
import { chargerCaisse, chargerFinances, chargerFrequentation, chargerInscrits, chargerProduction, chargerStock, contexte } from "@/lib/analytics"
import { ecrireAudit } from "@/lib/audit"
import { contexteEtablissement } from "@/lib/etablissement"
import { ANALYTICS_LECTURE, PAIE_LECTURE, hasRole } from "@/lib/permissions"
import { getSession } from "@/lib/session"

const texte = (message: string, status: number) => new NextResponse(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } })

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return texte("Session expirée.", 401)
  if (!hasRole(session.role, ANALYTICS_LECTURE)) return texte("Accès refusé.", 403)
  const { courant } = await contexteEtablissement()
  if (!courant) return texte("Aucun établissement actif.", 400)

  const u = new URL(req.url)
  const vue = u.searchParams.get("vue") ?? ""
  if (!Object.hasOwn(VUES, vue)) return texte("Rubrique inconnue.", 400)
  if (!(vuesPour(session.role) as string[]).includes(vue)) return texte("Accès refusé.", 403)
  const rang = Number(u.searchParams.get("table") ?? "0")
  if (!Number.isInteger(rang) || rang < 0) return texte("Tableau inconnu.", 400)

  const c = contexte(courant.id, periodeAnalytics(u.searchParams.get("p")))
  let tables: TableExport[]
  if (vue === "finances" && avecFinance(session.role)) tables = (await chargerFinances(c, hasRole(session.role, PAIE_LECTURE))).tables
  else if (vue === "production") tables = (await chargerProduction(c)).tables
  else if (vue === "stock") tables = (await chargerStock(c)).tables
  else if (vue === "caisse") tables = (await chargerCaisse(c)).tables
  else if (vue === "inscrits") tables = (await chargerInscrits(c)).tables
  else tables = (await chargerFrequentation(c)).tables

  const t = tables[rang]
  if (!t) return texte("Tableau inconnu.", 400)
  await ecrireAudit({ userId: session.userId, userEmail: session.email, action: "ANALYTICS_EXPORT", entity: "Analytics", entityId: t.nom, details: `${vue} ${c.n} jours` })
  return new NextResponse(versCsv(t.colonnes, t.lignes), {
    status: 200,
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${t.nom}-${c.fin}.csv"`, "cache-control": "no-store" },
  })
}