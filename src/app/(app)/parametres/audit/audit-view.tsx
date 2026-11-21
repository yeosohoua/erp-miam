import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { requireSession } from "@/lib/guards"
import { AUDIT_LECTURE, hasRole } from "@/lib/permissions"

const PAGE = 50
const format = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "medium", timeZone: "Africa/Abidjan" })
const dateOk = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"))

export async function AuditView({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession()
  if (!hasRole(session.role, AUDIT_LECTURE)) redirect("/parametres")

  const sp = await searchParams
  const un = (k: string): string => {
    const v = sp[k]
    return (Array.isArray(v) ? v[0] : v) ?? ""
  }
  const action = un("action").slice(0, 60)
  const q = un("q").trim().slice(0, 80)
  const du = dateOk(un("du")) ? un("du") : ""
  const au = dateOk(un("au")) ? un("au") : ""
  const page = Math.max(1, Number.parseInt(un("page"), 10) || 1)

  const where = {
    ...(action ? { action } : {}),
    ...(q ? { OR: [{ userEmail: { contains: q, mode: "insensitive" as const } }, { details: { contains: q, mode: "insensitive" as const } }] } : {}),
    ...(du || au
      ? { createdAt: { ...(du ? { gte: new Date(du + "T00:00:00.000Z") } : {}), ...(au ? { lt: new Date(Date.parse(au + "T00:00:00.000Z") + 86_400_000) } : {}) } }
      : {}),
  }

  const [total, lignes, actions] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
  ])
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const lien = (p: number) =>
    "/parametres/audit?" + new URLSearchParams({ ...(action ? { action } : {}), ...(q ? { q } : {}), ...(du ? { du } : {}), ...(au ? { au } : {}), page: String(p) }).toString()
  const champ = "h-9 rounded-md border bg-transparent px-3 text-sm"

  return (
    <div className="flex flex-col gap-6">
      <Link href="/parametres" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Retour aux paramètres
      </Link>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Journal d&apos;audit</h2>
        <p className="text-sm text-muted-foreground">Connexions, modifications de comptes, de données et opérations sensibles.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Évènements ({total})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form method="get" action="/parametres/audit" className="flex flex-wrap items-end gap-3" data-testid="filtres-audit">
            <select name="action" defaultValue={action} aria-label="Action" className={champ}>
              <option value="">Toutes les actions</option>
              {actions.map((a) => (
                <option key={a.action} value={a.action}>
                  {a.action}
                </option>
              ))}
            </select>
            <input name="q" defaultValue={q} placeholder="Utilisateur ou détails" aria-label="Recherche" className={champ} />
            <input name="du" type="date" defaultValue={du} aria-label="Du" className={champ} />
            <input name="au" type="date" defaultValue={au} aria-label="Au" className={champ} />
            <button type="submit" className="h-9 rounded-md border px-4 text-sm">
              Filtrer
            </button>
          </form>
          <div data-testid="liste-audit">
            {lignes.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="aucun-evenement">
                Aucun évènement.
              </p>
            ) : (
              <table className="w-full text-sm" data-testid="table-audit">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Utilisateur</th>
                    <th className="py-2 pr-4 font-medium">Action</th>
                    <th className="py-2 pr-4 font-medium">Détails</th>
                    <th className="py-2 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => (
                    <tr key={l.id} data-action={l.action} className="border-b align-top last:border-0">
                      <td className="whitespace-nowrap py-2 pr-4 text-xs">{format.format(l.createdAt)}</td>
                      <td className="py-2 pr-4">{l.userEmail ?? "—"}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{l.action}</td>
                      <td className="py-2 pr-4">{l.details ?? "—"}</td>
                      <td className="py-2 font-mono text-xs">{l.ip ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {pages > 1 ? (
            <div className="flex items-center gap-4 text-sm">
              {page > 1 ? <Link href={lien(page - 1)}>← Précédent</Link> : null}
              <span className="text-muted-foreground">
                Page {page} / {pages}
              </span>
              {page < pages ? <Link href={lien(page + 1)}>Suivant →</Link> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}