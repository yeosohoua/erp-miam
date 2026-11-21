import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { accesFacturation } from "@/lib/facturation-acces"
import { STATUTS_FACTURE, libellePeriode, numeroAffiche, restant, type StatutFacture } from "@/lib/facturation-base"
import { aujourdhui, formaterMontant, versDate, versIso } from "@/lib/menus"

import { generer } from "./actions"
import { GenerationForm } from "./formulaires"

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

export async function FacturationView({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const acces = await accesFacturation()
  if (!acces) redirect("/")
  const { etab, ecriture } = acces
  if (!etab) return <p className="text-sm text-destructive">Aucun établissement ne vous est affecté.</p>

  const sp = await searchParams
  const brut = (Array.isArray(sp.statut) ? sp.statut[0] : sp.statut) ?? ""
  const filtre: StatutFacture | null = Object.hasOwn(STATUTS_FACTURE, brut) ? (brut as StatutFacture) : null
  const jour = aujourdhui()
  const debutMois = versDate(jour.slice(0, 8) + "01")

  const [info, ouvertes, encaisse, factureMois, factures] = await Promise.all([
    db.etablissement.findUnique({ where: { id: etab.id }, select: { currency: true, prepaye: true } }),
    db.facture.findMany({ where: { etablissementId: etab.id, statut: "ISSUED" }, select: { total: true, echeance: true, reglements: { select: { montant: true } } } }),
    db.reglement.aggregate({ where: { etablissementId: etab.id, createdAt: { gte: debutMois } }, _sum: { montant: true } }),
    db.facture.aggregate({ where: { etablissementId: etab.id, statut: { in: ["ISSUED", "PAID"] }, emisLe: { gte: debutMois } }, _sum: { total: true } }),
    db.facture.findMany({
      where: { etablissementId: etab.id, ...(filtre ? { statut: filtre } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { client: { select: { name: true } }, reglements: { select: { montant: true } } },
    }),
  ])
  const devise = info?.currency ?? "XOF"
  const m = (n: number) => formaterMontant(n, devise)
  const enRetard = (echeance: Date | null) => !!echeance && versIso(echeance) < jour
  const aEncaisser = ouvertes.reduce((s, f) => s + restant(f.total, f.reglements), 0)
  const retard = ouvertes.filter((f) => enRetard(f.echeance)).reduce((s, f) => s + restant(f.total, f.reglements), 0)

  return (
    <div className="flex flex-col gap-6" data-testid="facturation-page">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Facturation</h2>
          <p className="text-sm text-muted-foreground">Factures mensuelles, règlements et relances — {etab.name}</p>
        </div>
        <Link href="/facturation/clients" className="ml-auto text-sm text-muted-foreground hover:underline">
          Clients payeurs →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat titre="À encaisser" valeur={m(aEncaisser)} brut={aEncaisser} testid="kpi-a-encaisser" note="Restant dû des factures émises" />
        <Stat titre="En retard" valeur={m(retard)} brut={retard} testid="kpi-en-retard" note="Échéance dépassée" />
        <Stat titre="Facturé ce mois" valeur={m(factureMois._sum.total ?? 0)} brut={factureMois._sum.total ?? 0} testid="kpi-facture" note="Factures émises ou payées" />
        <Stat titre="Encaissé ce mois" valeur={m(encaisse._sum.montant ?? 0)} brut={encaisse._sum.montant ?? 0} testid="kpi-encaisse" note="Règlements enregistrés" />
      </div>

      {ecriture ? (
        <Card>
          <CardHeader>
            <CardTitle>Générer les factures du mois</CardTitle>
            <CardDescription>
              Un brouillon par client, avec les repas servis qui n&apos;ont pas encore été facturés.
              {info?.prepaye ? " Le mode prépayé est actif : la facturation mensuelle est désactivée." : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GenerationForm action={generer} defaut={jour.slice(0, 7)} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Factures</CardTitle>
          <CardDescription>50 plus récentes.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/facturation" className={filtre ? "text-muted-foreground hover:underline" : "font-medium"}>
              Toutes
            </Link>
            {(Object.keys(STATUTS_FACTURE) as StatutFacture[]).map((s) => (
              <Link key={s} href={"/facturation?statut=" + s} className={filtre === s ? "font-medium" : "text-muted-foreground hover:underline"}>
                {STATUTS_FACTURE[s]}
              </Link>
            ))}
          </div>
          <table className="w-full text-sm" data-testid="factures">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">N°</th>
                <th className="py-2 pr-4 font-medium">Client</th>
                <th className="py-2 pr-4 font-medium">Période</th>
                <th className="py-2 pr-4 font-medium">Statut</th>
                <th className="py-2 pr-4 text-right font-medium">Total</th>
                <th className="py-2 pr-4 text-right font-medium">Restant</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {factures.map((f) => {
                const reste = f.statut === "ISSUED" ? restant(f.total, f.reglements) : 0
                const retardF = f.statut === "ISSUED" && enRetard(f.echeance) && reste > 0
                return (
                  <tr key={f.id} data-numero={f.numero ?? ""} data-statut={f.statut} data-total={f.total} data-restant={reste} data-retard={retardF ? "1" : "0"} data-client={f.client.name} className="border-b last:border-0">
                    <td className="py-2 pr-4">{numeroAffiche(f.numero)}</td>
                    <td className="py-2 pr-4">{f.client.name}</td>
                    <td className="py-2 pr-4 capitalize">{libellePeriode(f.periode)}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={f.statut === "PAID" ? "secondary" : "outline"}>{STATUTS_FACTURE[f.statut]}</Badge>
                      {retardF ? <span className="ml-2 text-xs font-medium text-red-600">En retard</span> : null}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{m(f.total)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{f.statut === "ISSUED" ? m(reste) : "—"}</td>
                    <td className="py-2 text-right">
                      <Link href={"/facturation/" + f.id} className="text-muted-foreground hover:underline">
                        Ouvrir →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {factures.length === 0 ? <p className="text-sm text-muted-foreground">Aucune facture.</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}