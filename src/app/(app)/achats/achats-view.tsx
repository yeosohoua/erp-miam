import Link from "next/link"
import { redirect } from "next/navigation"

import { BoutonAction } from "@/components/bouton-action"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { accesAchats } from "@/lib/approvisionnement-acces"
import { db } from "@/lib/db"
import { arrondi, aujourdhui, formaterMontant, versDate, versIso } from "@/lib/menus"
import { STATUTS_BON, numeroBon, type StatutBon } from "@/lib/stock-base"

import { creerBon, creerFournisseur, supprimerFournisseur } from "./actions"
import { BonForm, FournisseurForm } from "./formulaires"

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

export async function AchatsView() {
  const acces = await accesAchats()
  if (!acces) redirect("/")
  const { etab, ecriture } = acces
  if (!etab) return <p className="text-sm text-destructive">Aucun établissement ne vous est affecté.</p>
  const debutMois = versDate(aujourdhui().slice(0, 8) + "01")

  const [info, fournisseurs, bons, recuMois] = await Promise.all([
    db.etablissement.findUnique({ where: { id: etab.id }, select: { currency: true } }),
    db.fournisseur.findMany({ where: { etablissementId: etab.id }, orderBy: { name: "asc" }, include: { _count: { select: { bons: true } } } }),
    db.bonCommande.findMany({ where: { etablissementId: etab.id }, orderBy: { createdAt: "desc" }, take: 50, include: { fournisseur: { select: { name: true } }, lignes: true } }),
    db.mouvementStock.findMany({ where: { etablissementId: etab.id, type: "ENTREE", bonId: { not: null }, createdAt: { gte: debutMois } }, select: { quantite: true, prix: true } }),
  ])
  const devise = info?.currency ?? "XOF"
  const m = (n: number) => formaterMontant(n, devise)
  const total = (b: (typeof bons)[number]) => arrondi(b.lignes.reduce((s, l) => s + Number(l.quantite) * Number(l.prix), 0))
  const enCours = bons.filter((b) => b.statut === "SENT" || b.statut === "PARTIAL")
  const aRecevoir = arrondi(enCours.reduce((s, b) => s + b.lignes.reduce((t, l) => t + Math.max(0, Number(l.quantite) - Number(l.recue)) * Number(l.prix), 0), 0))
  const recu = arrondi(recuMois.reduce((s, x) => s + Number(x.quantite) * Number(x.prix ?? 0), 0))

  return (
    <div className="flex flex-col gap-6" data-testid="achats-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Achats</h2>
          <p className="text-sm text-muted-foreground">Fournisseurs et bons de commande — {etab.name}</p>
        </div>
        <Link href="/stock" className="text-sm text-muted-foreground hover:underline">
          Stock →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat titre="Bons en cours" valeur={String(enCours.length)} brut={enCours.length} testid="kpi-en-cours" note="Envoyés ou partiellement reçus" />
        <Stat titre="À recevoir" valeur={m(aRecevoir)} brut={aRecevoir} testid="kpi-a-recevoir" note="Valeur du reste à livrer" />
        <Stat titre="Reçu ce mois" valeur={m(recu)} brut={recu} testid="kpi-recu-mois" note="Valeur des réceptions du mois" />
        <Stat titre="Fournisseurs" valeur={String(fournisseurs.length)} brut={fournisseurs.length} testid="kpi-fournisseurs" note="Enregistrés" />
      </div>

      {ecriture ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Nouveau fournisseur</CardTitle>
            </CardHeader>
            <CardContent>
              <FournisseurForm action={creerFournisseur} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Nouveau bon de commande</CardTitle>
              <CardDescription>Le bon est créé en brouillon ; vous ajoutez ensuite les lignes puis l&apos;envoyez.</CardDescription>
            </CardHeader>
            <CardContent>
              <BonForm action={creerBon} fournisseurs={fournisseurs.map((f) => ({ id: f.id, name: f.name }))} />
            </CardContent>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Bons de commande</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm" data-testid="bons">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Numéro</th>
                <th className="py-2 pr-4 font-medium">Fournisseur</th>
                <th className="py-2 pr-4 font-medium">Statut</th>
                <th className="py-2 pr-4 text-right font-medium">Total</th>
                <th className="py-2 font-medium">Créé le</th>
              </tr>
            </thead>
            <tbody>
              {bons.map((b) => (
                <tr key={b.id} data-numero={numeroBon(b.numero)} data-statut={b.statut} data-total={total(b)} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    <Link href={"/achats/" + b.id} className="underline-offset-2 hover:underline">
                      {numeroBon(b.numero)}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{b.fournisseur.name}</td>
                  <td className="py-2 pr-4">{STATUTS_BON[b.statut as StatutBon]}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{m(total(b))}</td>
                  <td className="py-2 text-muted-foreground">{versIso(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {bons.length === 0 ? <p className="text-sm text-muted-foreground">Aucun bon de commande.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fournisseurs</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm" data-testid="fournisseurs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Nom</th>
                <th className="py-2 pr-4 font-medium">Contact</th>
                <th className="py-2 pr-4 text-right font-medium">Bons</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {fournisseurs.map((f) => (
                <tr key={f.id} data-fournisseur={f.name} data-bons={f._count.bons} className="border-b align-top last:border-0">
                  <td className="py-2 pr-4">{f.name}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{[f.email, f.phone].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{f._count.bons}</td>
                  <td className="py-2 text-right">{ecriture ? <BoutonAction action={supprimerFournisseur.bind(null, f.id)} label="Supprimer" variant="ghost" /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {fournisseurs.length === 0 ? <p className="text-sm text-muted-foreground">Aucun fournisseur.</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}