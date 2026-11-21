import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { TYPES_ETABLISSEMENT } from "@/lib/etablissements"
import { requireSession } from "@/lib/guards"
import { ETABLISSEMENTS_ADMIN, hasRole } from "@/lib/permissions"

import { basculerEtablissement, creerEtablissement } from "./actions"
import { BasculeEtablissement } from "./bascule-etablissement"
import { EtablissementForm } from "./etablissement-form"

export async function EtablissementsView() {
  const session = await requireSession()
  if (!hasRole(session.role, ETABLISSEMENTS_ADMIN)) redirect("/parametres")

  const liste = await db.etablissement.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { users: true } } },
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Établissements</h2>
        <p className="text-sm text-muted-foreground">Écoles, entreprises et autres sites gérés dans cette installation.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nouvel établissement</CardTitle>
        </CardHeader>
        <CardContent>
          <EtablissementForm mode="creation" action={creerEtablissement} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Liste ({liste.length})</CardTitle>
          <CardDescription>Un établissement désactivé n&apos;est plus proposé dans le sélecteur.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm" data-testid="table-etablissements">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Code</th>
                <th className="py-2 pr-4 font-medium">Nom</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Utilisateurs</th>
                <th className="py-2 pr-4 font-medium">Statut</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {liste.map((e) => (
                <tr key={e.id} data-etab={e.code} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs">{e.code}</td>
                  <td className="py-2 pr-4">
                    <Link href={"/parametres/etablissements/" + e.id} className="font-medium hover:underline">
                      {e.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{TYPES_ETABLISSEMENT[e.type]}</td>
                  <td className="py-2 pr-4">{e._count.users}</td>
                  <td className="py-2 pr-4">
                    <Badge variant={e.active ? "secondary" : "outline"}>{e.active ? "Actif" : "Désactivé"}</Badge>
                  </td>
                  <td className="py-2">
                    <BasculeEtablissement action={basculerEtablissement.bind(null, e.id)} active={e.active} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}