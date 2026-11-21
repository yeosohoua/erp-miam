"use client"

import { useActionState, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { verifier2fa, type VerifEtat } from "./actions"

export function VerificationForm() {
  const [etat, action, enCours] = useActionState<VerifEtat, FormData>(verifier2fa, undefined)
  const [code, setCode] = useState("")
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="code-2fa">Code à 6 chiffres ou code de secours</Label>
        <Input id="code-2fa" name="code" autoComplete="one-time-code" inputMode="text" autoFocus value={code} onChange={(e) => setCode(e.target.value)} disabled={enCours} />
      </div>
      {etat?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {etat.error}
        </p>
      ) : null}
      <Button type="submit" disabled={enCours}>
        {enCours ? "Vérification..." : "Valider"}
      </Button>
    </form>
  )
}