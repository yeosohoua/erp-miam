import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { KPIS, LIBELLES_GRAVITE_ALERTE, LIBELLES_STATUT_OBJECTIF, formaterValeur } from "@/lib/pilotage-base"
import { accesPilotage } from "@/lib/pilotage-acces"
import { chargerAlertes, tableauKpis } from "@/lib/pilotage"

import { revoquerCleApi, supprimerObjectif } from "./actions"
import { FormCle, FormObjectif, type Option } from "./formulaires"

type SP = Record<string, string | string[] | undefined>
const un = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? ""
const th = "px-3 py-2 text-left font-medium"
const td = "px-3 py-2"
const fr = (d: Date): string => d.toISOString().slice(0, 10).split("-").reverse().join("/")
const COULEUR_STATUT: Record<string, string> = { ATTEINT: "text-green-700", PROCHE: "text-amber-600", ECART: "text-destructive", SANS_DONNEE: "text-muted-foreground" }
const COULEUR_GRAVITE: Record<string, string> = { CRITIQUE: "text-destructive", IMPORTANT: "text-amber-600", INFO: "text-muted-foreground" }

export async function PilotageView({ searchParams }: { searchParams: Promise<SP> }) {
  const acces = await accesPilotage()
  if (!acces) {
    return (
      <p data-testid="acces-refuse" className="text-sm text-muted-foreground">
        Cette page est réservée à l&apos;administration, à la direction et à la comptabilité.
      </p>
    )
  }
  const { etab, admin, api } = acces
  if (!etab) return <p className="text-sm text-muted-foreground">Aucun établissement actif.</p>
  const vues: Record<string, string> = { tableau: "Tableau de bord", alertes: "Alertes", objectifs: "Objectifs" }
  if (api) vues.api = "Clés d'API"
  const sp = await searchParams
  const demande = un(sp.vue)
  const vue = Object.hasOwn(vues, demande) ? demande : "tableau"
  return (
    <div className="flex flex-col gap-6" data-testid="pilotage-page">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Pilotage et intégration</h2>
          <p className="text-sm text-muted-foreground">{etab.name} — indicateurs, alertes, objectifs et accès pour vos outils externes</p>
        </div>
        <nav className="ml-auto flex flex-wrap gap-2 text-sm" data-testid="pilotage-onglets">
          {Object.keys(vues).map((k) => (
            <Link key={k} href={"/pilotage?vue=" + k} className={"rounded-md border px-3 py-1.5 " + (k === vue ? "bg-muted font-medium" : "hover:bg-muted")}>
              {vues[k]}
            </Link>
          ))}
        </nav>
      </div>
      {vue === "tableau" ? await Tableau({ etabId: etab.id }) : null}
      {vue === "alertes" ? await Alertes({ etabId: etab.id }) : null}
      {vue === "objectifs" ? await Objectifs({ etabId: etab.id, admin }) : null}
      {vue === "api" && api ? await Cles({ etabId: etab.id }) : null}
    </div>
  )
}

async function Tableau({ etabId }: { etabId: string }) {
  const lignes = await tableauKpis(etabId)
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="tableau-kpis">
      {lignes.map((l) => (
        <div key={l.id} data-kpi={l.id} className="flex flex-col gap-1 rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">{l.libelle}</p>
          <p data-valeur className="text-2xl font-semibold">{formaterValeur(l.valeur, l.decimales, l.unite)}</p>
          {l.cible !== null && l.statut ? (
            <p className="text-xs">
              Objectif {l.sens === "MAX" ? "minimum" : "maximum"} : {formaterValeur(l.cible, l.decimales, l.unite)} ·{" "}
              <span data-statut className={COULEUR_STATUT[l.statut]}>{LIBELLES_STATUT_OBJECTIF[l.statut]}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Aucun objectif défini</p>
          )}
        </div>
      ))}
    </div>
  )
}

async function Alertes({ etabId }: { etabId: string }) {
  const alertes = await chargerAlertes(etabId)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Centre d&apos;alertes</CardTitle>
        <CardDescription>Les points qui demandent une action, du plus grave au moins grave.</CardDescription>
      </CardHeader>
      <CardContent>
        {alertes.length === 0 ? (
          <p data-testid="aucune-alerte" className="text-sm text-muted-foreground">Aucune alerte : tout est à jour.</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="liste-alertes">
            {alertes.map((a) => (
              <li key={a.code} data-alerte={a.code} className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
                <span className={"w-24 font-medium " + COULEUR_GRAVITE[a.gravite]}>{LIBELLES_GRAVITE_ALERTE[a.gravite]}</span>
                <span className="flex-1">
                  <span className="font-medium">{a.titre}</span>
                  <span className="block text-muted-foreground">{a.detail}</span>
                </span>
                <Link href={a.lien} className="rounded-md border px-3 py-1.5 hover:bg-muted">Ouvrir</Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

async function Objectifs({ etabId, admin }: { etabId: string; admin: boolean }) {
  const lignes = (await tableauKpis(etabId)).filter((l) => l.cible !== null)
  const options: Option[] = KPIS.map((k) => ({ value: k.id, label: k.libelle }))
  return (
    <>
      {admin ? (
        <Card>
          <CardHeader>
            <CardTitle>Définir un objectif</CardTitle>
            <CardDescription>Un objectif existant pour le même indicateur est remplacé.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormObjectif kpis={options} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Objectifs de l&apos;établissement</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-objectifs">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className={th}>Indicateur</th>
                <th className={th}>Cible</th>
                <th className={th}>Valeur actuelle</th>
                <th className={th}>Statut</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.id} data-objectif={l.id} className="border-b last:border-0">
                  <td className={td}>{l.libelle}</td>
                  <td className={td}>{formaterValeur(l.cible, l.decimales, l.unite)}</td>
                  <td className={td}>{formaterValeur(l.valeur, l.decimales, l.unite)}</td>
                  <td className={td + " " + COULEUR_STATUT[l.statut ?? "SANS_DONNEE"]}>{LIBELLES_STATUT_OBJECTIF[l.statut ?? "SANS_DONNEE"]}</td>
                  <td className={td}>
                    {admin ? (
                      <form action={supprimerObjectif.bind(null, l.id)}>
                        <Button type="submit" variant="outline" size="sm">Retirer</Button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
              {lignes.length === 0 ? (
                <tr>
                  <td className={td + " text-muted-foreground"} colSpan={5}>Aucun objectif défini.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  )
}

async function Cles({ etabId }: { etabId: string }) {
  const cles = await db.cleApi.findMany({ where: { etablissementId: etabId }, orderBy: { createdAt: "desc" } })
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Créer une clé d&apos;API</CardTitle>
          <CardDescription>La clé complète n&apos;est affichée qu&apos;une seule fois. Seule son empreinte est conservée : elle ne peut pas être retrouvée, seulement révoquée.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormCle />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Clés de l&apos;établissement</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-cles">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className={th}>Nom</th>
                <th className={th}>Préfixe</th>
                <th className={th}>Créée le</th>
                <th className={th}>Dernière utilisation</th>
                <th className={th}>État</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {cles.map((c) => (
                <tr key={c.id} data-cle={c.nom} className="border-b last:border-0">
                  <td className={td}>{c.nom}</td>
                  <td className={td}>miam_{c.prefixe}_…</td>
                  <td className={td}>{fr(c.createdAt)}</td>
                  <td className={td}>{c.derniereUtilisation ? fr(c.derniereUtilisation) : "Jamais"}</td>
                  <td className={td}>{c.actif ? "Active" : "Révoquée"}</td>
                  <td className={td}>
                    {c.actif ? (
                      <form action={revoquerCleApi.bind(null, c.id)}>
                        <Button type="submit" variant="outline" size="sm">Révoquer</Button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
              {cles.length === 0 ? (
                <tr>
                  <td className={td + " text-muted-foreground"} colSpan={6}>Aucune clé.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Utilisation</CardTitle>
          <CardDescription>Lecture seule, limitée à 60 requêtes par minute et par clé. Chaque clé ne voit que son établissement.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>Ajoutez l&apos;en-tête <code>Authorization: Bearer VOTRE_CLE</code> à chaque appel.</p>
          <ul className="list-disc pl-5">
            <li><code>GET /api/v1/etablissement</code> : code et nom de l&apos;établissement</li>
            <li><code>GET /api/v1/menus?du=AAAA-MM-JJ&amp;au=AAAA-MM-JJ</code> : menus publiés (31 jours au plus)</li>
            <li><code>GET /api/v1/kpis</code> : indicateurs et objectifs</li>
            <li><code>GET /api/v1/alertes</code> : centre d&apos;alertes</li>
            <li><code>GET /api/v1/frequentation?jours=30</code> : repas servis par jour et par service</li>
          </ul>
        </CardContent>
      </Card>
    </>
  )
}