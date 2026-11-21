import Link from "next/link"
import { redirect } from "next/navigation"

import { classeSelect } from "@/components/form-messages"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { ORDRE_SERVICES, SERVICES, formaterMontant } from "@/lib/menus"
import { accesPaiements } from "@/lib/paiements-acces"
import { METHODES, TYPES_OPERATION } from "@/lib/paiements-base"

import { enregistrerTarifs, recharger } from "./actions"
import { RechargeForm } from "./recharge-form"
import { TarifsForm } from "./tarifs-form"

const HEURE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Abidjan" })

function Stat({ titre, valeur, brut, testid, note }: { titre: string; valeur: string; brut: number; testid: string; note: string }) {
  return (
    <Card data-testid={testid} data-valeur={brut}>
      <CardHeader className="pb-2">
        <CardDescription>{titre}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{valeur}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{note}</CardContent>
    </Card>
  )
}

export async function PaiementsView({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const acces = await accesPaiements()
  if (!acces) redirect("/")
  const { etab, ecriture, config } = acces
  if (!etab) return <p className="text-sm text-destructive">Aucun établissement ne vous est affecté.</p>

  const sp = await searchParams
  const brutQ = (Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? ""
  const q = brutQ.trim().slice(0, 60)
  const epuiseSeulement = (Array.isArray(sp.filtre) ? sp.filtre[0] : sp.filtre) === "epuise"
  const maintenant = new Date()
  const debutMois = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1))

  const [info, encours, epuises, recharges, consommes, comptes, operations] = await Promise.all([
    db.etablissement.findUnique({ where: { id: etab.id }, select: { currency: true, prepaye: true, tarifs: { select: { service: true, prix: true } } } }),
    db.inscrit.aggregate({ where: { etablissementId: etab.id }, _sum: { solde: true } }),
    db.inscrit.count({ where: { etablissementId: etab.id, statut: "ACTIVE", solde: { lte: 0 } } }),
    db.transaction.aggregate({ where: { etablissementId: etab.id, type: "TOPUP", createdAt: { gte: debutMois } }, _sum: { montant: true } }),
    db.transaction.aggregate({ where: { etablissementId: etab.id, type: { in: ["DEBIT", "REFUND"] }, createdAt: { gte: debutMois } }, _sum: { montant: true } }),
    db.inscrit.findMany({
      where: {
        etablissementId: etab.id,
        statut: { not: "LEFT" },
        ...(epuiseSeulement ? { solde: { lte: 0 } } : {}),
        ...(q ? { OR: [{ matricule: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 50,
      include: { groupe: true },
    }),
    db.transaction.findMany({ where: { etablissementId: etab.id }, orderBy: { createdAt: "desc" }, take: 15, include: { inscrit: { select: { matricule: true, firstName: true, lastName: true } } } }),
  ])
  const devise = info?.currency ?? "XOF"
  const prepaye = info?.prepaye ?? false
  const prix: Record<string, number> = Object.fromEntries((info?.tarifs ?? []).map((t) => [t.service, t.prix]))
  const consomme = -(consommes._sum.montant ?? 0)
  const m = (n: number) => formaterMontant(n, devise)

  return (
    <div className="flex flex-col gap-6" data-testid="paiements-page">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Paiements</h2>
          <p className="text-sm text-muted-foreground">Comptes prépayés et recharges — {etab.name}</p>
        </div>
        <Badge variant={prepaye ? "secondary" : "outline"} data-testid="mode-prepaye" data-actif={prepaye ? "1" : "0"}>
          {prepaye ? "Débit automatique actif" : "Débit automatique désactivé"}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat titre="Encours prépayé" valeur={m(encours._sum.solde ?? 0)} brut={encours._sum.solde ?? 0} testid="kpi-encours" note="Somme des soldes des comptes" />
        <Stat titre="Recharges du mois" valeur={m(recharges._sum.montant ?? 0)} brut={recharges._sum.montant ?? 0} testid="kpi-recharges" note="Espèces et Mobile Money" />
        <Stat titre="Repas consommés" valeur={m(consomme)} brut={consomme} testid="kpi-consomme" note="Débits du mois, remboursements déduits" />
        <Stat titre="Comptes épuisés" valeur={String(epuises)} brut={epuises} testid="kpi-epuises" note="Inscrits actifs à solde nul ou négatif" />
      </div>

      {ecriture ? (
        <Card>
          <CardHeader>
            <CardTitle>Recharger un compte</CardTitle>
            <CardDescription>Espèces, ou Mobile Money avec la référence de la transaction (chaque référence ne peut servir qu&apos;une fois).</CardDescription>
          </CardHeader>
          <CardContent>
            <RechargeForm action={recharger} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Tarifs et débit automatique</CardTitle>
          <CardDescription>Prix du repas pour chaque service. Un prix à 0 rend le service gratuit.</CardDescription>
        </CardHeader>
        <CardContent>
          {config ? (
            <TarifsForm key={JSON.stringify([prix, prepaye])} action={enregistrerTarifs} prix={prix} prepaye={prepaye} />
          ) : (
            <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm" data-testid="tarifs-lecture">
              {ORDRE_SERVICES.map((s) => (
                <li key={s}>
                  {SERVICES[s]} : {m(prix[s] ?? 0)}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Comptes</CardTitle>
          <CardDescription>50 premiers résultats. Ouvrez une fiche pour voir l&apos;historique.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action="/paiements" className="flex flex-wrap items-center gap-3">
            <input name="q" defaultValue={q} placeholder="Nom ou matricule" className={classeSelect + " max-w-xs"} />
            {epuiseSeulement ? <input type="hidden" name="filtre" value="epuise" /> : null}
            <button type="submit" className="h-9 rounded-md border px-3 text-sm hover:bg-muted">
              Rechercher
            </button>
            <Link href={epuiseSeulement ? "/paiements" : "/paiements?filtre=epuise"} className="text-sm text-muted-foreground hover:underline">
              {epuiseSeulement ? "Voir tous les comptes" : "Voir seulement les comptes épuisés"}
            </Link>
          </form>
          <table className="w-full text-sm" data-testid="comptes">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Matricule</th>
                <th className="py-2 pr-4 font-medium">Nom</th>
                <th className="py-2 pr-4 font-medium">Groupe</th>
                <th className="py-2 pr-4 text-right font-medium">Solde</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {comptes.map((c) => (
                <tr key={c.id} data-matricule={c.matricule} data-solde={c.solde} className="border-b last:border-0">
                  <td className="py-2 pr-4">{c.matricule}</td>
                  <td className="py-2 pr-4">
                    {c.lastName} {c.firstName}
                  </td>
                  <td className="py-2 pr-4">{c.groupe?.name ?? "—"}</td>
                  <td className={"py-2 pr-4 text-right tabular-nums " + (c.solde <= 0 ? "font-medium text-red-600" : "")}>{m(c.solde)}</td>
                  <td className="py-2 text-right">
                    <Link href={"/paiements/" + c.id} className="text-muted-foreground hover:underline">
                      Fiche →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {comptes.length === 0 ? <p className="text-sm text-muted-foreground">Aucun compte trouvé.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dernières opérations</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm" data-testid="operations">
            <tbody>
              {operations.map((o) => (
                <tr key={o.id} data-type={o.type} data-montant={o.montant} className="border-b last:border-0">
                  <td className="py-2 pr-4 text-muted-foreground">{HEURE.format(o.createdAt)}</td>
                  <td className="py-2 pr-4">{o.inscrit.lastName + " " + o.inscrit.firstName + " (" + o.inscrit.matricule + ")"}</td>
                  <td className="py-2 pr-4">
                    {TYPES_OPERATION[o.type]}
                    {o.methode ? " · " + METHODES[o.methode] : ""}
                  </td>
                  <td className={"py-2 text-right tabular-nums " + (o.montant < 0 ? "text-red-600" : "text-emerald-600")}>{(o.montant > 0 ? "+" : "") + m(o.montant)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {operations.length === 0 ? <p className="text-sm text-muted-foreground">Aucune opération pour le moment.</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}