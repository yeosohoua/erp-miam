import { redirect } from "next/navigation"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { accesInscrits } from "@/lib/inscrits-acces"

import { importerInscrits } from "../actions"
import { OngletsInscrits } from "../onglets-inscrits"

import { ImportForm } from "./import-form"

export async function ImportView() {
  const acces = await accesInscrits()
  if (!acces || !acces.ecriture || !acces.etab) redirect("/inscrits")

  return (
    <div className="flex flex-col gap-6">
      <OngletsInscrits ecriture />
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Import CSV</h2>
        <p className="text-sm text-muted-foreground">Chargez une liste d&apos;inscrits dans {acces.etab.name}. Rien n&apos;est enregistré si une ligne est invalide.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Format attendu</CardTitle>
          <CardDescription>
            Séparateur point-virgule ou virgule, première ligne d&apos;en-tête, sans guillemets. Colonnes : matricule, prenom, nom (obligatoires), type (eleve, employe ou invite), groupe, regime. Les groupes et régimes absents sont créés. 500 lignes maximum.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="rounded-md border bg-muted/40 p-3 text-xs">{"matricule;prenom;nom;type;groupe;regime\nE001;Awa;Kone;eleve;CE1;\nS014;Yao;Koffi;employe;;Sans porc"}</pre>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <ImportForm action={importerInscrits} />
        </CardContent>
      </Card>
    </div>
  )
}