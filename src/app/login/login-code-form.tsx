"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import type { LoginState } from "./actions"
import { connexionCode } from "./code-actions"

export function LoginCodeForm() {
  const [etat, action, enCours] = useActionState<LoginState, FormData>(connexionCode, undefined)

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="code-etab">Code de l&apos;établissement</Label>
        <Input id="code-etab" name="etab" autoComplete="off" autoCapitalize="characters" required placeholder="Ex. GSL-COCODY" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="code-saisie">Code d&apos;accès (5 caractères)</Label>
        <Input id="code-saisie" name="code" autoComplete="off" autoCapitalize="characters" maxLength={8} required className="font-mono uppercase tracking-widest" />
      </div>
      {etat?.error ? (
        <p role="alert" data-testid="login-code-erreur" className="text-sm text-destructive">
          {etat.error}
        </p>
      ) : null}
      <Button type="submit" data-testid="login-code-submit" disabled={enCours}>
        {enCours ? "Connexion..." : "Se connecter avec le code"}
      </Button>
    </form>
  )
}