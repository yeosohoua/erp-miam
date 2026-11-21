import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BoutonAction } from "@/components/bouton-action"
import { db } from "@/lib/db"
import { accesInscrits } from "@/lib/inscrits-acces"
import { STATUTS_INSCRIT, TYPES_INSCRIT } from "@/lib/inscrits"

import { ajouterTuteur, modifierInscrit, regenererBadge, retirerTuteur } from "../actions"
import { InscritForm } from "../inscrit-form"
import { PhotoForm } from "@/components/photo-form"
import { retirerPhotoInscrit, televerserPhotoInscrit } from "../photo-actions"
import { TuteurForm } from "../tuteur-form"

export async function InscritDetail({ id }: { id: string }) {
  const acces = await accesInscrits()
  if (!acces) redirect("/")
  const { etab, ecriture } = acces
  if (!etab) redirect("/inscrits")

  // Filtre par l'etablissement actif : un identifiant d'un autre etablissement renvoie a la liste.
  const i = await db.inscrit.findFirst({
    where: { id, etablissementId: etab.id },
    include: { groupe: true, regime: true, allergies: { include: { allergie: true } }, tuteurs: { orderBy: { createdAt: "asc" } } },
  })
  if (!i) redirect("/inscrits")
  const refs = ecriture ? await db.referentiel.findMany({ where: { etablissementId: etab.id }, orderBy: { name: "asc" }, select: { id: true, kind: true, name: true } }) : []

  return (
    <div className="flex flex-col gap-6" data-testid="fiche-inscrit">
      <Link href="/inscrits" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Retour aux inscrits
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Photo</CardTitle>
          <CardDescription>PNG, JPEG ou WebP : l&apos;image est réduite automatiquement avant l&apos;envoi.</CardDescription>
        </CardHeader>
        <CardContent>
          {ecriture ? (
            <PhotoForm imageId={i.imageId} nom={i.firstName + " " + i.lastName} televerser={televerserPhotoInscrit.bind(null, id)} retirer={retirerPhotoInscrit.bind(null, id)} />
          ) : i.imageId ? (
            <img data-testid="photo-apercu" src={"/api/images/" + i.imageId} alt={"Photo de " + i.firstName + " " + i.lastName} className="size-20 rounded-full border object-cover" />
          ) : (
            <p className="text-sm text-muted-foreground">Aucune photo.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {i.lastName} {i.firstName}
          </CardTitle>
          <CardDescription>
            Matricule <span className="font-mono">{i.matricule}</span> · {TYPES_INSCRIT[i.type]} · <Badge variant="secondary">{STATUTS_INSCRIT[i.statut]}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ecriture ? (
            <InscritForm
              mode="edition"
              action={modifierInscrit.bind(null, id)}
              groupes={refs.filter((r) => r.kind === "GROUPE")}
              regimes={refs.filter((r) => r.kind === "REGIME")}
              allergies={refs.filter((r) => r.kind === "ALLERGIE")}
              valeurs={{
                matricule: i.matricule,
                prenom: i.firstName,
                nom: i.lastName,
                type: i.type,
                statut: i.statut,
                groupeId: i.groupeId ?? "",
                regimeId: i.regimeId ?? "",
                allergies: i.allergies.map((a) => a.allergieId),
              }}
            />
          ) : (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Groupe</dt>
                <dd>{i.groupe?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Régime</dt>
                <dd>{i.regime?.name ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Allergies</dt>
                <dd>{i.allergies.map((a) => a.allergie.name).join(", ") || "—"}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Badge</CardTitle>
          <CardDescription>Code unique utilisé au service. Régénérer invalide l&apos;ancien badge.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <span data-testid="badge-code" className="rounded-md border px-3 py-2 font-mono text-sm tracking-widest">
            {i.badge}
          </span>
          {ecriture ? <BoutonAction action={regenererBadge.bind(null, id)} label="Régénérer le badge" /> : null}
        </CardContent>
      </Card>

      {ecriture ? (
        <Card>
          <CardHeader>
            <CardTitle>Tuteurs et contacts</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {i.tuteurs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun tuteur renseigné.</p>
            ) : (
              <ul className="flex flex-col gap-3" data-testid="liste-tuteurs">
                {i.tuteurs.map((t) => (
                  <li key={t.id} data-tuteur={t.name} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0">
                    <div className="text-sm">
                      <p className="font-medium">
                        {t.name} {t.relation ? <span className="font-normal text-muted-foreground">({t.relation})</span> : null}
                      </p>
                      <p className="text-muted-foreground">{[t.phone, t.email].filter(Boolean).join(" · ") || "Aucun contact"}</p>
                    </div>
                    <BoutonAction action={retirerTuteur.bind(null, id, t.id)} label="Retirer" />
                  </li>
                ))}
              </ul>
            )}
            <TuteurForm action={ajouterTuteur.bind(null, id)} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}