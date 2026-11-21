import { UtensilsCrossed } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { lireDefi } from "@/lib/defi-2fa"
import { NOM_APP } from "@/lib/marque"

import { VerificationForm } from "./verification-form"

export const metadata: Metadata = { title: "Vérification en deux étapes" }

async function Contenu() {
  if (!(await lireDefi())) redirect("/login")
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vérification en deux étapes</CardTitle>
        <CardDescription>Saisissez le code de votre application d&apos;authentification, ou un code de secours.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <VerificationForm />
        <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
          Retour à la connexion
        </Link>
      </CardContent>
    </Card>
  )
}

export default function Page() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <UtensilsCrossed className="size-5" />
          </div>
          <span className="text-lg font-semibold">{NOM_APP}</span>
        </div>
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <Contenu />
        </Suspense>
      </div>
    </main>
  )
}