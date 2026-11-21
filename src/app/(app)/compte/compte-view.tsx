import * as QRCode from "qrcode"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { requireSession } from "@/lib/guards"
import { NOM_APP } from "@/lib/marque"
import { LIBELLES_ROLES, type RoleValue } from "@/lib/roles"
import { dechiffrer } from "@/lib/secret-box"
import { uriOtpauth } from "@/lib/totp"

import { AvatarForm } from "./avatar-form"
import { MotDePasseForm, ProfilForm } from "./compte-forms"
import { DoubleAuth } from "./double-auth"

export async function CompteView() {
  const session = await requireSession()
  const u = await db.user.findUnique({ where: { id: session.userId }, select: { totpEnabled: true, totpSecret: true, recoveryCodes: true, imageId: true } })
  const secret = u && !u.totpEnabled && u.totpSecret ? dechiffrer(u.totpSecret) : null
  const mode: "off" | "setup" | "on" = u?.totpEnabled ? "on" : secret ? "setup" : "off"
  const qrSvg = secret ? await QRCode.toString(uriOtpauth(secret, session.email, NOM_APP), { type: "svg", margin: 1, width: 192 }) : null

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Mon compte</h2>
        <p className="text-sm text-muted-foreground">
          {session.email} · {LIBELLES_ROLES[session.role as RoleValue] ?? session.role}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfilForm nom={session.name} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Photo de profil</CardTitle>
          <CardDescription>Affichée dans le menu en haut à droite. PNG, JPEG ou WebP : l&apos;image est réduite automatiquement.</CardDescription>
        </CardHeader>
        <CardContent>
          <AvatarForm imageId={u?.imageId ?? null} nom={session.name} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Mot de passe</CardTitle>
          <CardDescription>Après un changement, vos autres sessions sont déconnectées.</CardDescription>
        </CardHeader>
        <CardContent>
          <MotDePasseForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Double authentification</CardTitle>
          <CardDescription>Protège votre compte même si votre mot de passe est découvert.</CardDescription>
        </CardHeader>
        <CardContent>
          <DoubleAuth mode={mode} secret={secret} qrSvg={qrSvg} restants={u?.recoveryCodes.length ?? 0} />
        </CardContent>
      </Card>
    </div>
  )
}