import Link from "next/link"
import { redirect } from "next/navigation"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { etatConfig } from "@/lib/config"
import { DEFINITIONS, GROUPES } from "@/lib/config-base"
import { requireSession } from "@/lib/guards"
import { PARAMETRES_ADMIN, hasRole } from "@/lib/permissions"

import { enregistrerGroupe } from "./actions"
import { GroupeForm, type ChampConfig } from "./formulaires"

export async function ConfigurationView() {
  const session = await requireSession()
  if (!hasRole(session.role, PARAMETRES_ADMIN)) redirect("/")
  const etat = await etatConfig()
  const base = etat.valeurs.APP_URL

  return (
    <div className="flex flex-col gap-6" data-testid="configuration-page">
      <div>
        <Link href="/parametres" className="text-sm text-muted-foreground hover:underline">
          ← Paramètres
        </Link>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">Configuration</h2>
        <p className="text-sm text-muted-foreground">
          Les valeurs sont chiffrées avant d&apos;être enregistrées et les secrets ne sont jamais réaffichés. Une valeur définie dans le fichier .env du serveur reste prioritaire.
        </p>
      </div>
      {GROUPES.map((g) => {
        const champs: ChampConfig[] = DEFINITIONS.filter((d) => d.groupe === g.id).map((d) => ({
          cle: d.cle,
          libelle: d.libelle,
          aide: d.aide,
          exemple: d.exemple,
          secret: d.secret,
          source: etat.sources[d.cle],
          valeur: d.secret || etat.sources[d.cle] !== "BASE" ? "" : etat.valeurs[d.cle],
        }))
        return (
          <Card key={g.id} data-testid="groupe" data-groupe={g.id}>
            <CardHeader>
              <CardTitle>{g.titre}</CardTitle>
              <CardDescription>{g.description}</CardDescription>
              {g.id === "PAYSTACK" ? (
                <p className="text-sm" data-testid="url-webhook">
                  Webhook à déclarer chez Paystack : <span className="font-mono">{base ? base + "/api/paystack/webhook" : "définissez d'abord l'adresse publique du site"}</span>
                </p>
              ) : null}
              {g.id === "APPLICATION" ? (
                <p className="text-sm" data-testid="url-cron">
                  Appel planifié : <span className="font-mono">POST {base ? base : "…"}/api/notifications/traiter</span> avec l&apos;en-tête x-cron-secret.
                </p>
              ) : null}
            </CardHeader>
            <CardContent>
              <GroupeForm id={g.id} champs={champs} action={enregistrerGroupe.bind(null, g.id)} />
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}