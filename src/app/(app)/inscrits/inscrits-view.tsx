import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { accesInscrits } from "@/lib/inscrits-acces"
import { STATUTS_INSCRIT, TYPES_INSCRIT, typeInscritValide } from "@/lib/inscrits"

import { creerInscrit } from "./actions"
import { InscritForm } from "./inscrit-form"
import { OngletsInscrits } from "./onglets-inscrits"

const PAGE = 25

export async function InscritsView({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const acces = await accesInscrits()
  if (!acces) redirect("/")
  const { etab, ecriture } = acces
  if (!etab) return <p className="text-sm text-destructive">Aucun établissement ne vous est affecté.</p>

  const sp = await searchParams
  const un = (k: string): string => {
    const v = sp[k]
    return (Array.isArray(v) ? v[0] : v) ?? ""
  }
  const q = un("q").trim().slice(0, 60)
  const type = un("type")
  const groupe = un("groupe")
  const page = Math.max(1, Number.parseInt(un("page"), 10) || 1)

  const where = {
    etablissementId: etab.id,
    ...(q
      ? {
          OR: [
            { matricule: { contains: q, mode: "insensitive" as const } },
            { firstName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(typeInscritValide(type) ? { type } : {}),
    ...(groupe ? { groupeId: groupe } : {}),
  }

  const [total, lignes, refs] = await Promise.all([
    db.inscrit.count({ where }),
    db.inscrit.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { groupe: { select: { name: true } }, regime: { select: { name: true } } },
    }),
    db.referentiel.findMany({ where: { etablissementId: etab.id }, orderBy: { name: "asc" }, select: { id: true, kind: true, name: true } }),
  ])
  const groupes = refs.filter((r) => r.kind === "GROUPE")
  const regimes = refs.filter((r) => r.kind === "REGIME")
  const allergies = refs.filter((r) => r.kind === "ALLERGIE")
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const lien = (p: number) => "/inscrits?" + new URLSearchParams({ ...(q ? { q } : {}), ...(type ? { type } : {}), ...(groupe ? { groupe } : {}), page: String(p) }).toString()

  return (
    <div className="flex flex-col gap-6">
      <OngletsInscrits ecriture={ecriture} />
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Inscrits</h2>
        <p className="text-sm text-muted-foreground">Élèves, employés et invités de {etab.name}.</p>
      </div>

      {ecriture ? (
        <Card>
          <CardHeader>
            <CardTitle>Nouvel inscrit</CardTitle>
          </CardHeader>
          <CardContent>
            <InscritForm mode="creation" action={creerInscrit} groupes={groupes} regimes={regimes} allergies={allergies} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Liste ({total})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form method="get" action="/inscrits" className="flex flex-wrap items-end gap-3" data-testid="filtres-inscrits">
            <input name="q" defaultValue={q} placeholder="Nom, prénom ou matricule" aria-label="Recherche" className="h-9 rounded-md border bg-transparent px-3 text-sm" />
            <select name="type" defaultValue={type} aria-label="Type" className="h-9 rounded-md border bg-transparent px-3 text-sm">
              <option value="">Tous les types</option>
              {Object.entries(TYPES_INSCRIT).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <select name="groupe" defaultValue={groupe} aria-label="Groupe" className="h-9 rounded-md border bg-transparent px-3 text-sm">
              <option value="">Tous les groupes</option>
              {groupes.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button type="submit" className="h-9 rounded-md border px-4 text-sm">
              Filtrer
            </button>
          </form>

          <div data-testid="liste-inscrits">
            {lignes.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="aucun-inscrit">
                Aucun inscrit.
              </p>
            ) : (
              <table className="w-full text-sm" data-testid="table-inscrits">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="w-10 py-2 pr-2" />
                    <th className="py-2 pr-4 font-medium">Matricule</th>
                    <th className="py-2 pr-4 font-medium">Nom</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Groupe</th>
                    <th className="py-2 pr-4 font-medium">Régime</th>
                    <th className="py-2 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((i) => (
                    <tr key={i.id} data-matricule={i.matricule} className="border-b last:border-0">
                      <td className="py-2 pr-2">{i.imageId ? <img src={"/api/images/" + i.imageId} alt="" loading="lazy" className="size-8 rounded-full border object-cover" /> : <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full border bg-muted text-xs text-muted-foreground">{(i.firstName[0] ?? "") + (i.lastName[0] ?? "")}</span>}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{i.matricule}</td>
                      <td className="py-2 pr-4">
                        <Link href={"/inscrits/" + i.id} className="font-medium hover:underline">
                          {i.lastName} {i.firstName}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">{TYPES_INSCRIT[i.type]}</td>
                      <td className="py-2 pr-4">{i.groupe?.name ?? "—"}</td>
                      <td className="py-2 pr-4">{i.regime?.name ?? "—"}</td>
                      <td className="py-2">
                        <Badge variant={i.statut === "ACTIVE" ? "secondary" : "outline"}>{STATUTS_INSCRIT[i.statut]}</Badge>
                      </td>
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