import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { requireSession } from "@/lib/guards"
import { ETABLISSEMENTS_ADMIN, ETABLISSEMENT_EDITION, hasRole } from "@/lib/permissions"

import { modifierEtablissement } from "../actions"
import { EtablissementForm } from "../etablissement-form"
import { PhotoForm } from "@/components/photo-form"
import { retirerLogo, televerserLogo } from "../logo-actions"

export async function EtablissementDetail({ id }: { id: string }) {
  const session = await requireSession()
  if (!hasRole(session.role, ETABLISSEMENT_EDITION)) redirect("/parametres")
  const e = await db.etablissement.findUnique({ where: { id } })
  if (!e) notFound()
  const admin = hasRole(session.role, ETABLISSEMENTS_ADMIN)
  if (!admin) {
    const lien = await db.userEtablissement.findUnique({ where: { userId_etablissementId: { userId: session.userId, etablissementId: id } } })
    if (!lien) redirect("/parametres")
  }

  return (
    <div className="flex flex-col gap-6">
      {admin ? (
        <Link href="/parametres/etablissements" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Retour aux établissements
        </Link>
      ) : (
        <Link href="/parametres" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Retour aux paramètres
        </Link>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{e.name}</CardTitle>
          <CardDescription>
            Code : <span className="font-mono">{e.code}</span> (non modifiable)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EtablissementForm
            mode="edition"
            action={modifierEtablissement.bind(null, id)}
            valeurs={{ code: e.code, nom: e.name, type: e.type, adresse: e.address ?? "", tel: e.phone ?? "", email: e.email ?? "", devise: e.currency }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>PNG, JPEG ou WebP : l&apos;image est réduite automatiquement avant l&apos;envoi.</CardDescription>
        </CardHeader>
        <CardContent>
          <PhotoForm imageId={e.logoId} nom={e.name} televerser={televerserLogo.bind(null, id)} retirer={retirerLogo.bind(null, id)} />
        </CardContent>
      </Card>
    </div>
  )
}