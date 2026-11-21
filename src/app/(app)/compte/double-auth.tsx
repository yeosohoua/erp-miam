"use client"

import { useActionState, useState } from "react"

import { Messages } from "@/components/form-messages"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { confirmer2fa, demarrer2fa, desactiver2fa, regenererCodesSecours } from "@/lib/double-auth-actions"
import type { EtatAction, EtatCodes } from "@/lib/etat-action"

export function DoubleAuth({ mode, secret, qrSvg, restants }: { mode: "off" | "setup" | "on"; secret: string | null; qrSvg: string | null; restants: number }) {
  const [eStart, aStart, pStart] = useActionState<EtatAction, FormData>(demarrer2fa, undefined)
  const [eConf, aConf, pConf] = useActionState<EtatCodes, FormData>(confirmer2fa, undefined)
  const [eReg, aReg, pReg] = useActionState<EtatCodes, FormData>(regenererCodesSecours, undefined)
  const [eOff, aOff, pOff] = useActionState<EtatAction, FormData>(desactiver2fa, undefined)
  const [code, setCode] = useState("")
  const [mdpReg, setMdpReg] = useState("")
  const [mdpOff, setMdpOff] = useState("")
  const codes = eReg?.codes ?? eConf?.codes

  return (
    <div className="flex flex-col gap-6">
      {codes ? (
        <div className="rounded-md border p-4" data-testid="codes-secours">
          <p className="mb-2 text-sm font-medium">Codes de secours — notez-les maintenant, ils ne seront plus affichés.</p>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Chaque code ne sert qu&apos;une fois.</p>
        </div>
      ) : null}

      {mode === "off" ? (
        <form action={aStart} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Ajoutez une seconde étape à la connexion avec une application d&apos;authentification (Google Authenticator, Microsoft Authenticator, Aegis…).</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pStart}>
              Activer la double authentification
            </Button>
            <Messages etat={eStart} />
          </div>
        </form>
      ) : null}

      {mode === "setup" ? (
        <div className="flex flex-col gap-4" data-testid="config-2fa">
          <p className="text-sm text-muted-foreground">1. Scannez ce code QR avec votre application (ou saisissez la clé à la main). 2. Entrez le code à 6 chiffres affiché.</p>
          {qrSvg ? <div data-testid="qr-2fa" className="w-48 rounded-md bg-white p-2" dangerouslySetInnerHTML={{ __html: qrSvg }} /> : null}
          <p className="text-sm">
            Clé : <code data-testid="secret-2fa" className="font-mono">{secret}</code>
          </p>
          <form action={aConf} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tfa-code">Code à 6 chiffres</Label>
              <Input id="tfa-code" name="code" autoComplete="one-time-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} disabled={pConf} className="max-w-48" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={pConf}>
                Confirmer et activer
              </Button>
              <Messages etat={eConf} />
            </div>
          </form>
          <form action={aStart}>
            <Button type="submit" variant="ghost" size="sm" disabled={pStart}>
              Générer une nouvelle clé
            </Button>
          </form>
        </div>
      ) : null}

      {mode === "on" ? (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3 text-sm">
            <Badge variant="secondary">Activée</Badge>
            <span className="text-muted-foreground">{restants} code(s) de secours restant(s).</span>
          </div>
          <form action={aReg} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tfa-reg-mdp">Mot de passe (pour régénérer les codes de secours)</Label>
              <Input id="tfa-reg-mdp" name="motdepasse" type="password" autoComplete="current-password" value={mdpReg} onChange={(e) => setMdpReg(e.target.value)} disabled={pReg} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="outline" disabled={pReg}>
                Régénérer les codes de secours
              </Button>
              {eReg?.error ? <Messages etat={{ error: eReg.error }} /> : null}
            </div>
          </form>
          <form action={aOff} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tfa-off-mdp">Mot de passe (pour désactiver)</Label>
              <Input id="tfa-off-mdp" name="motdepasse" type="password" autoComplete="current-password" value={mdpOff} onChange={(e) => setMdpOff(e.target.value)} disabled={pOff} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="outline" disabled={pOff}>
                Désactiver la double authentification
              </Button>
              <Messages etat={eOff} />
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}