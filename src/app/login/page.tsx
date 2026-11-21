import type { Metadata } from "next"
import { UtensilsCrossed } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { NOM_APP } from "@/lib/marque"

import { LoginCodeForm } from "./login-code-form"
import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Connexion" }

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <UtensilsCrossed className="size-5" />
          </div>
          <span className="text-lg font-semibold">{NOM_APP}</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Connexion</CardTitle>
            <CardDescription>Entrez vos identifiants pour accéder à votre espace.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
        <details data-testid="login-code" className="rounded-xl border bg-card p-4 text-card-foreground">
          <summary className="cursor-pointer text-sm font-medium">Connexion avec un code d&apos;accès</summary>
          <div className="mt-4">
            <LoginCodeForm />
          </div>
        </details>
      </div>
    </main>
  )
}