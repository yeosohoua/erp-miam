import { redirect } from "next/navigation"

import { BoutonAction } from "@/components/bouton-action"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { accesInscrits } from "@/lib/inscrits-acces"
import { KINDS, type KindRef } from "@/lib/inscrits"

import { creerReferentiel, supprimerReferentiel } from "../actions"
import { OngletsInscrits } from "../onglets-inscrits"
import { ReferentielForm } from "../referentiel-form"

export async function ReferentielsView() {
  const acces = await accesInscrits()
  if (!acces || !acces.ecriture) redirect("/inscrits")
  const { etab } = acces
  if (!etab) redirect("/inscrits")

  const liste = await db.referentiel.findMany({
    where: { etablissementId: etab.id },
    orderBy: { name: "asc" },
    include: { _count: { select: { groupeInscrits: true, regimeInscrits: true, allergies: true } } },
  })

  return (
    <div className="flex flex-col gap-6">
      <OngletsInscrits ecriture />
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Référentiels</h2>
        <p className="text-sm text-muted-foreground">Groupes, régimes et allergies propres à {etab.name}.</p>
      </div>
      {(Object.keys(KINDS) as KindRef[]).map((kind) => (
        <Card key={kind}>
          <CardHeader>
            <CardTitle>{KINDS[kind]}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div data-testid={"ref-" + kind}>
              <ReferentielForm kind={kind} action={creerReferentiel.bind(null, kind)} />
            </div>
            <ul className="flex flex-col gap-2">
              {liste
                .filter((r) => r.kind === kind)
                .map((r) => {
                  const usage = r._count.groupeInscrits + r._count.regimeInscrits + r._count.allergies
                  return (
                    <li key={r.id} data-ref={r.name} className="flex flex-wrap items-center justify-between gap-3 border-b pb-2 text-sm last:border-0">
                      <span>
                        {r.name} <span className="text-muted-foreground">({usage} inscrit(s))</span>
                      </span>
                      <BoutonAction action={supprimerReferentiel.bind(null, r.id)} label="Supprimer" />
                    </li>
                  )
                })}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}