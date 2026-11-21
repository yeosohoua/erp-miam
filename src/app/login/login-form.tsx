"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { login, type LoginState } from "./actions"

export function LoginForm() {
  const [etat, action, enCours] = useActionState<LoginState, FormData>(login, undefined)

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Adresse e-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Mot de passe</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {etat?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {etat.error}
        </p>
      ) : null}
      <Button type="submit" disabled={enCours}>
        {enCours ? "Connexion..." : "Se connecter"}
      </Button>
    </form>
  )
}