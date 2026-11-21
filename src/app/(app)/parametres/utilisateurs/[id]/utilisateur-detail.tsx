import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { requireSession } from "@/lib/guards"
import { UTILISATEURS_ADMIN, hasRole } from "@/lib/permissions"

import { BoutonAction } from "@/components/bouton-action"
import { reinitialiser2faUtilisateur } from "@/lib/double-auth-actions"

import { modifierUtilisateur, reinitialiserMotDePasse } from "../actions"
import { ReinitialisationForm, UtilisateurForm } from "../utilisateur-form"

export async function UtilisateurDetail({ id }: { id: string }) {
  const session = await requireSession()
  if (!hasRole(session.role, UTILISATEURS_ADMIN)) redirect("/")

  const [u, etablissements] = await Promise.all([
    db.user.findUnique({ where: { id }, include: { etablissements: { select: { etablissementId: true } } } }),
    db.etablissement.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
  ])
  if (!u) notFound()
  const estMoi = id === session.userId

  return (
    <div className="flex flex-col gap-6">
      <Link href="/parametres/utilisateurs" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Retour aux utilisateurs
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{u.name}</CardTitle>
          <CardDescription>
            Un changement de rôle ou de statut déconnecte aussitôt la personne.
            {estMoi ? " Il s'agit de votre propre compte : rôle et statut sont verrouillés." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UtilisateurForm
            mode="edition"
            action={modifierUtilisateur.bind(null, id)}
            etablissements={etablissements}
            valeurs={{ nom: u.name, email: u.email, role: u.role, mdp: "", actif: u.active, etabs: u.etablissements.map((l) => l.etablissementId) }}
          />
        </CardContent>
      </Card>
      {estMoi || !u.totpEnabled ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Double authentification</CardTitle>
            <CardDescription>À utiliser si la personne a perdu son téléphone et ses codes de secours. Ses sessions sont coupées.</CardDescription>
          </CardHeader>
          <CardContent>
            <BoutonAction action={reinitialiser2faUtilisateur.bind(null, id)} label="Réinitialiser la 2FA" />
          </CardContent>
        </Card>
      )}
      {estMoi ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Réinitialiser le mot de passe</CardTitle>
            <CardDescription>Les sessions ouvertes de cette personne sont coupées et son blocage éventuel est levé.</CardDescription>
          </CardHeader>
          <CardContent>
            <ReinitialisationForm action={reinitialiserMotDePasse.bind(null, id)} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}