import Link from "next/link"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formaterMontant } from "@/lib/menus"
import type { chargerRecettes } from "@/lib/recettes"

import { GraphiqueRecettes } from "./recettes-graphique"

export function CarteRecettes({ recettes, devise }: { recettes: Awaited<ReturnType<typeof chargerRecettes>>; devise: string }) {
  const m = (n: number) => formaterMontant(n, devise)
  return (
    <Card data-testid="recettes" data-recharges={recettes.recharges} data-consomme={recettes.consomme} data-encours={recettes.encours}>
      <CardHeader>
        <CardTitle>Recettes prépayées</CardTitle>
        <CardDescription>Recharges encaissées et repas consommés sur la période.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Recharges</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{m(recettes.recharges)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Consommation</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{m(recettes.consomme)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Encours des comptes</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{m(recettes.encours)}</p>
          </div>
        </div>
        <GraphiqueRecettes data={recettes.serie.map((s) => ({ label: s.label, recharges: s.recharges, consomme: s.consomme }))} />
        <Link href="/paiements" className="text-xs text-muted-foreground hover:underline">
          Ouvrir les paiements →
        </Link>
      </CardContent>
    </Card>
  )
}