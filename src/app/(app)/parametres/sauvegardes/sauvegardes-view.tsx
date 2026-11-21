import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireSession } from "@/lib/guards"
import { SAUVEGARDE_ADMIN, hasRole } from "@/lib/permissions"

import { RestaurationForm } from "./restauration-form"

export async function SauvegardesView() {
  const session = await requireSession()
  if (!hasRole(session.role, SAUVEGARDE_ADMIN)) redirect("/parametres")

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/parametres" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Retour aux paramètres
      </Link>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Sauvegardes</h2>
        <p className="text-sm text-muted-foreground">Une sauvegarde automatique de la base est aussi réalisée chaque nuit par le conteneur de sauvegarde (14 jours conservés).</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Exporter</CardTitle>
          <CardDescription>
            Fichier JSON contenant toutes les données, y compris les mots de passe hachés et les secrets 2FA chiffrés. Conservez-le en lieu sûr. Les secrets 2FA ne sont lisibles qu&apos;avec le même SESSION_SECRET.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a href="/api/sauvegarde" download className={buttonVariants({ variant: "default" })}>
            Télécharger une sauvegarde
          </a>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Restaurer</CardTitle>
          <CardDescription>
            Remplace TOUTES les données actuelles par celles du fichier, en une seule opération : en cas d&apos;erreur, rien n&apos;est modifié. Les sessions peuvent être coupées ensuite.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RestaurationForm />
        </CardContent>
      </Card>
    </div>
  )
}