import Link from "next/link"
import { redirect } from "next/navigation"

import { BoutonAction } from "@/components/bouton-action"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { ORDRE_SERVICES, SERVICES, ajouterJours, aujourdhui, dateValide, joursDeLaSemaine, libelleCourt, lundiDe, versDate, versIso } from "@/lib/menus"
import { accesMenus } from "@/lib/menus-acces"

import { dupliquerSemainePrecedente } from "./actions"
import { OngletsMenus } from "./onglets-menus"

export async function MenusView({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const acces = await accesMenus()
  if (!acces) redirect("/")
  const { etab, ecriture } = acces
  if (!etab) return <p className="text-sm text-destructive">Aucun établissement ne vous est affecté.</p>

  const sp = await searchParams
  const brut = (Array.isArray(sp.semaine) ? sp.semaine[0] : sp.semaine) ?? ""
  const lundi = dateValide(brut) ? lundiDe(brut) : lundiDe(aujourdhui())
  const jours = joursDeLaSemaine(lundi)

  const menus = await db.menu.findMany({
    where: { etablissementId: etab.id, date: { gte: versDate(lundi), lt: versDate(ajouterJours(lundi, 7)) } },
    include: { plats: { include: { plat: { select: { name: true } } } } },
  })
  const parCle = new Map(menus.map((m) => [versIso(m.date) + "_" + m.service, m]))
  const lien = (iso: string) => "/menus?semaine=" + iso

  return (
    <div className="flex flex-col gap-6">
      <OngletsMenus />
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Planning des menus</h2>
        <p className="text-sm text-muted-foreground">Semaine du {libelleCourt(lundi)} — {etab.name}.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Semaine</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start gap-4 text-sm">
            <Link href={lien(ajouterJours(lundi, -7))} className="hover:underline">
              ← Semaine précédente
            </Link>
            <Link href={lien(lundiDe(aujourdhui()))} className="hover:underline">
              Aujourd&apos;hui
            </Link>
            <Link href={lien(ajouterJours(lundi, 7))} className="hover:underline">
              Semaine suivante →
            </Link>
            {ecriture ? <BoutonAction action={dupliquerSemainePrecedente.bind(null, lundi)} label="Copier la semaine précédente" /> : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm" data-testid="planning">
              <thead>
                <tr>
                  <th className="border p-2 text-left font-medium" />
                  {jours.map((j) => (
                    <th key={j} className="border p-2 text-left font-medium capitalize">
                      {libelleCourt(j)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ORDRE_SERVICES.map((s) => (
                  <tr key={s}>
                    <th className="border p-2 text-left font-medium">{SERVICES[s]}</th>
                    {jours.map((j) => {
                      const m = parCle.get(j + "_" + s)
                      return (
                        <td key={j} data-cell={j + "_" + s} className="border p-2 align-top">
                          <Link href={"/menus/jour/" + j + "/" + s} className="flex flex-col gap-1 hover:underline">
                            {m ? (
                              <>
                                {m.plats.slice(0, 3).map((p) => (
                                  <span key={p.platId}>{p.plat.name}</span>
                                ))}
                                {m.plats.length > 3 ? <span className="text-muted-foreground">+ {m.plats.length - 3}</span> : null}
                                <Badge variant={m.statut === "PUBLISHED" ? "secondary" : "outline"} className="w-fit">
                                  {m.statut === "PUBLISHED" ? "Publié" : "Brouillon"}
                                </Badge>
                              </>
                            ) : (
                              <span className="text-muted-foreground">{ecriture ? "+ Ajouter" : "—"}</span>
                            )}
                          </Link>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}