import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { BoutonAction } from "@/components/bouton-action"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { accesAchats } from "@/lib/approvisionnement-acces"
import { db } from "@/lib/db"
import { arrondi, formaterMontant, formaterNombre, versIso } from "@/lib/menus"
import { STATUTS_BON, numeroBon, q3, type StatutBon } from "@/lib/stock-base"

import { ajouterLigneBon, annulerBon, envoyerBon, recevoirLigne, retirerLigneBon, supprimerBon } from "../actions"
import { LigneForm, ReceptionForm } from "../formulaires"

export async function BonView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const acces = await accesAchats()
  if (!acces) redirect("/")
  const { etab, ecriture, reception } = acces
  if (!etab) return <p className="text-sm text-destructive">Aucun établissement ne vous est affecté.</p>
  const bon = await db.bonCommande.findFirst({
    where: { id, etablissementId: etab.id },
    include: { fournisseur: { select: { name: true } }, lignes: { include: { ingredient: { select: { name: true, unit: true } } }, orderBy: { ingredient: { name: "asc" } } } },
  })
  if (!bon) notFound()
  const [info, ingredients, lots] = await Promise.all([
    db.etablissement.findUnique({ where: { id: etab.id }, select: { currency: true } }),
    bon.statut === "DRAFT" && ecriture ? db.ingredient.findMany({ where: { etablissementId: etab.id }, orderBy: { name: "asc" }, select: { id: true, name: true, unit: true } }) : Promise.resolve([]),
    db.lot.findMany({ where: { bonId: bon.id, etablissementId: etab.id }, orderBy: { recuLe: "asc" }, include: { ingredient: { select: { name: true, unit: true } } } }),
  ])
  const m = (n: number) => formaterMontant(n, info?.currency ?? "XOF")
  const total = arrondi(bon.lignes.reduce((s, l) => s + Number(l.quantite) * Number(l.prix), 0))
  const brouillon = bon.statut === "DRAFT"
  const receptionOuverte = bon.statut === "SENT" || bon.statut === "PARTIAL"
  const aucuneReception = bon.lignes.every((l) => Number(l.recue) === 0)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/achats" className="text-sm text-muted-foreground hover:underline">
          ← Achats
        </Link>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">{numeroBon(bon.numero)}</h2>
        <p className="text-sm text-muted-foreground">
          {bon.fournisseur.name}
          {bon.note ? " — " + bon.note : ""}
        </p>
      </div>

      <Card data-testid="bon-detail" data-statut={bon.statut} data-total={total} data-numero={numeroBon(bon.numero)}>
        <CardHeader>
          <CardTitle>
            {STATUTS_BON[bon.statut as StatutBon]} — {m(total)}
          </CardTitle>
          {bon.envoyeLe ? <CardDescription>Envoyé le {versIso(bon.envoyeLe)}</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex flex-wrap items-start gap-3">
          {brouillon && ecriture ? (
            <>
              <BoutonAction action={envoyerBon.bind(null, bon.id)} label="Envoyer le bon" />
              <BoutonAction action={supprimerBon.bind(null, bon.id)} label="Supprimer le brouillon" variant="ghost" />
            </>
          ) : null}
          {bon.statut === "SENT" && aucuneReception && ecriture ? <BoutonAction action={annulerBon.bind(null, bon.id)} label="Annuler le bon" variant="ghost" /> : null}
        </CardContent>
      </Card>

      {brouillon && ecriture ? (
        <Card>
          <CardHeader>
            <CardTitle>Ajouter une ligne</CardTitle>
          </CardHeader>
          <CardContent>
            <LigneForm action={ajouterLigneBon.bind(null, bon.id)} ingredients={ingredients} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Lignes</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm" data-testid="lignes-bon">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Ingrédient</th>
                <th className="py-2 pr-4 text-right font-medium">Commandé</th>
                <th className="py-2 pr-4 text-right font-medium">Reçu</th>
                <th className="py-2 pr-4 text-right font-medium">Prix unitaire</th>
                <th className="py-2 pr-4 text-right font-medium">Montant</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {bon.lignes.map((l) => {
                const reste = q3(Number(l.quantite) - Number(l.recue))
                return (
                  <tr key={l.id} data-ingredient={l.ingredient.name} data-commande={Number(l.quantite)} data-recue={Number(l.recue)} className="border-b align-top last:border-0">
                    <td className="py-2 pr-4">{l.ingredient.name}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formaterNombre(Number(l.quantite))} {l.ingredient.unit}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formaterNombre(Number(l.recue))}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{m(Number(l.prix))}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{m(arrondi(Number(l.quantite) * Number(l.prix)))}</td>
                    <td className="py-2">
                      {brouillon && ecriture ? <BoutonAction action={retirerLigneBon.bind(null, l.id)} label="Retirer" variant="ghost" /> : null}
                      {receptionOuverte && reception && reste > 0 ? <ReceptionForm action={recevoirLigne.bind(null, l.id)} ingredient={l.ingredient.name} /> : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {bon.lignes.length === 0 ? <p className="text-sm text-muted-foreground">Aucune ligne pour le moment.</p> : null}
        </CardContent>
      </Card>

      {lots.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Lots reçus</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm" data-testid="lots-recus">
              {lots.map((l) => (
                <li key={l.id} data-ref={l.reference}>
                  {l.reference} — {l.ingredient.name} : {formaterNombre(Number(l.quantite))} {l.ingredient.unit}
                  {l.peremption ? " (péremption " + versIso(l.peremption) + ")" : ""}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}