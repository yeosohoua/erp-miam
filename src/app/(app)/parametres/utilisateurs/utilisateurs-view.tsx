import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { requireSession } from "@/lib/guards"
import { UTILISATEURS_ADMIN, hasRole } from "@/lib/permissions"
import { LIBELLES_ROLES, type RoleValue } from "@/lib/roles"

import { creerUtilisateur } from "./actions"
import { UtilisateurForm } from "./utilisateur-form"

export async function UtilisateursView() {
  const session = await requireSession()
  if (!hasRole(session.role, UTILISATEURS_ADMIN)) redirect("/")

  const [utilisateurs, etablissements] = await Promise.all([
    db.user.findMany({
      where: { NOT: { email: { endsWith: "@acces.miam.local" } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { etablissements: { include: { etablissement: { select: { code: true } } } } },
    }),
    db.etablissement.findMany({ where: { active: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Utilisateurs</h2>
        <p className="text-sm text-muted-foreground">Comptes, rôles et établissements affectés.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nouvel utilisateur</CardTitle>
        </CardHeader>
        <CardContent>
          <UtilisateurForm mode="creation" action={creerUtilisateur} etablissements={etablissements} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Liste ({utilisateurs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm" data-testid="table-utilisateurs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Nom</th>
                <th className="py-2 pr-4 font-medium">E-mail</th>
                <th className="py-2 pr-4 font-medium">Rôle</th>
                <th className="py-2 pr-4 font-medium">Établissements</th>
                <th className="py-2 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {utilisateurs.map((u) => (
                <tr key={u.id} data-user={u.email} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    <Link href={"/parametres/utilisateurs/" + u.id} className="font-medium hover:underline">
                      {u.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{u.email}</td>
                  <td className="py-2 pr-4">{LIBELLES_ROLES[u.role as RoleValue] ?? u.role}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{u.role === "ADMIN" ? "Tous" : u.etablissements.map((l) => l.etablissement.code).join(", ") || "—"}</td>
                  <td className="py-2">
                    <Badge variant={u.active ? "secondary" : "outline"}>{u.active ? "Actif" : "Désactivé"}</Badge>
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