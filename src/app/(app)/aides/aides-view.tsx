import { Button } from "@/components/ui/button"
import { accesAides } from "@/lib/aides-acces"
import { TYPES_AIDE, libelleAide } from "@/lib/aides-base"
import { chargerAides, chargerAttributions, chargerSynthese, jourIso } from "@/lib/aides"
import { formaterNombre } from "@/lib/menus"

import { basculerAide, terminerAttribution } from "./actions"
import { AideFormulaire, AttributionFormulaire } from "./formulaires"

function Kpi({ id, libelle, valeur, aide }: { id: string; libelle: string; valeur: string; aide?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4" data-kpi={id}>
      <p className="text-xs text-muted-foreground">{libelle}</p>
      <p className="text-2xl font-semibold tabular-nums">{valeur}</p>
      {aide ? <p className="mt-1 text-xs text-muted-foreground">{aide}</p> : null}
    </div>
  )
}

export async function AidesView() {
  const a = await accesAides()
  if (!a) return <div data-testid="acces-refuse" className="text-muted-foreground">Cette page est réservée au gestionnaire et à l&apos;administrateur.</div>
  if (!a.etab) return <p className="text-muted-foreground">Aucun établissement actif.</p>
  const [aides, attributions, synthese] = await Promise.all([chargerAides(a.etab.id), chargerAttributions(a.etab.id), chargerSynthese(a.etab.id)])
  const actives = aides.filter((x) => x.active)
  const aujourdhui = jourIso()
  return (
    <div className="space-y-6" data-testid="aides-page">
      <div>
        <h1 className="text-2xl font-semibold">Aides sociales</h1>
        <p className="text-sm text-muted-foreground">Bourses, gratuités et tarifs sociaux appliqués automatiquement au prix du repas. Une seule aide s&apos;applique : la plus avantageuse. Informations confidentielles.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi id="aides-actives" libelle="Aides actives" valeur={String(actives.length)} />
        <Kpi id="beneficiaires" libelle="Bénéficiaires aujourd'hui" valeur={String(synthese.beneficiaires)} aide={synthese.tauxPct === null ? undefined : `${String(synthese.tauxPct).replace(".", ",")} % des inscrits actifs`} />
        <Kpi id="repas-aides" libelle="Repas aidés (30 jours)" valeur={formaterNombre(synthese.repasAides)} />
        <Kpi id="cout-aides" libelle="Coût estimé (30 jours)" valeur={formaterNombre(synthese.coutEstime) + " FCFA"} aide="Réductions consenties sur les repas servis" />
      </div>

      {a.ecriture ? (
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="font-medium">Créer une aide</h2>
          <AideFormulaire />
        </section>
      ) : null}

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 font-medium">Aides disponibles</h2>
        <table className="w-full text-sm" data-testid="aides">
          <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Nom</th><th>Type</th><th>Règle</th><th>Bénéficiaires</th><th>Statut</th><th /></tr></thead>
          <tbody>
            {aides.length === 0 ? <tr><td colSpan={6} className="py-3 text-muted-foreground">Aucune aide pour le moment.</td></tr> : null}
            {aides.map((x) => (
              <tr key={x.id} className="border-b last:border-0" data-aide={x.id} data-nom={x.nom} data-actif={x.active}>
                <td className="py-2 font-medium">{x.nom}{x.description ? <span className="block text-xs font-normal text-muted-foreground">{x.description}</span> : null}</td>
                <td>{TYPES_AIDE[x.type]}</td>
                <td>{libelleAide(x)}</td>
                <td data-beneficiaires={x.beneficiaires}>{x.beneficiaires}</td>
                <td>{x.active ? "Active" : "Inactive"}</td>
                <td className="text-right">
                  {a.ecriture ? <form action={basculerAide.bind(null, x.id)}><Button type="submit" size="sm" variant="outline">{x.active ? "Désactiver" : "Activer"}</Button></form> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-medium">Attributions</h2>
        {a.ecriture ? <AttributionFormulaire aides={actives.map((x) => ({ id: x.id, nom: x.nom }))} aujourdhui={jourIso()} /> : null}
        <table className="w-full text-sm" data-testid="attributions">
          <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Matricule</th><th>Nom</th><th>Aide</th><th>Période</th><th>Motif</th><th>État</th><th /></tr></thead>
          <tbody>
            {attributions.length === 0 ? <tr><td colSpan={7} className="py-3 text-muted-foreground">Aucune attribution.</td></tr> : null}
            {attributions.map((x) => (
              <tr key={x.id} className="border-b last:border-0" data-attribution={x.id} data-matricule={x.matricule} data-aide-nom={x.aideNom} data-active={x.active}>
                <td className="py-2">{x.matricule}</td><td>{x.nom}</td><td>{x.aideNom} ({libelleAide(x)})</td>
                <td>{x.debut} → {x.fin ?? "sans fin"}</td><td>{x.motif ?? ""}</td><td>{x.active ? "En cours" : "Terminée"}</td>
                <td className="text-right">
                  {a.ecriture && (x.active || x.debut > aujourdhui) ? <form action={terminerAttribution.bind(null, x.id)}><Button type="submit" size="sm" variant="outline">{x.debut > aujourdhui ? "Retirer" : "Terminer"}</Button></form> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}