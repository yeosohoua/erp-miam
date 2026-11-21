import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ecrireAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { accesInscrits } from "@/lib/inscrits-acces"
import { dechiffrer } from "@/lib/secret-box"

import { basculer, genererManquants, regenerer } from "./codes-actions"
import { ImprimerCodes } from "./imprimer-codes"
import { OngletsInscrits } from "../onglets-inscrits"

type CodeLigne = { id: string; codeChiffre: string; actif: boolean } | null

function Ligne({ nom, detail, cible, code }: { nom: string; detail: string; cible: string; code: CodeLigne }) {
  const valeur = code ? (dechiffrer(code.codeChiffre) ?? "?") : null
  return (
    <tr data-testid="code-ligne" data-cible={cible} data-nom={nom} className="border-b last:border-0">
      <td className="py-2 pr-4">{nom}</td>
      <td className="py-2 pr-4 text-muted-foreground">{detail}</td>
      <td className="py-2 pr-4">
        {code && valeur ? (
          <span data-testid="code-valeur" data-actif={code.actif ? "1" : "0"} className={"font-mono text-base font-semibold tracking-widest" + (code.actif ? "" : " text-muted-foreground line-through")}>
            {valeur}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-2 print:hidden">
        {code ? (
          <div className="flex gap-2">
            <form action={regenerer.bind(null, code.id)}>
              <Button type="submit" size="sm" variant="outline" data-testid="code-regenerer">
                Régénérer
              </Button>
            </form>
            <form action={basculer.bind(null, code.id)}>
              <Button type="submit" size="sm" variant="ghost" data-testid="code-basculer">
                {code.actif ? "Désactiver" : "Activer"}
              </Button>
            </form>
          </div>
        ) : null}
      </td>
    </tr>
  )
}

function Tableau({ titre, lignes }: { titre: string; lignes: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titre}</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Nom</th>
              <th className="pb-2 pr-4 font-medium">Détail</th>
              <th className="pb-2 pr-4 font-medium">Code</th>
              <th className="pb-2 print:hidden" />
            </tr>
          </thead>
          <tbody>{lignes}</tbody>
        </table>
      </CardContent>
    </Card>
  )
}

export async function CodesView() {
  const a = await accesInscrits()
  if (!a || !a.ecriture) return <p className="text-sm text-muted-foreground">Accès non autorisé pour votre rôle.</p>
  if (!a.etab) return <p className="text-sm text-muted-foreground">Aucun établissement actif.</p>
  const etab = a.etab
  const choix = { id: true, codeChiffre: true, actif: true } as const

  const [inscrits, employes, parents] = await Promise.all([
    db.inscrit.findMany({
      where: { etablissementId: etab.id, statut: { not: "LEFT" } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { matricule: true, firstName: true, lastName: true, codeAcces: { select: choix } },
    }),
    db.employeRh.findMany({
      where: { etablissementId: etab.id, actif: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { matricule: true, firstName: true, lastName: true, poste: true, codeAcces: { select: choix } },
    }),
    db.codeAcces.findMany({ where: { etablissementId: etab.id, cible: "PARENT" }, orderBy: { tuteurEmail: "asc" }, select: { id: true, codeChiffre: true, actif: true, tuteurEmail: true } }),
  ])
  await ecrireAudit({ userId: a.session.userId, userEmail: a.session.email, action: "CODES_ACCES_CONSULTES", entity: "Etablissement", entityId: etab.id })
  const manquants = inscrits.filter((i) => !i.codeAcces).length + employes.filter((e) => !e.codeAcces).length

  return (
    <div className="flex flex-col gap-6">
      <OngletsInscrits ecriture={a.ecriture} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Codes d&apos;accès</h1>
          <p className="text-sm text-muted-foreground">
            {etab.name} · code de l&apos;établissement à saisir à la connexion : <span className="font-mono font-semibold">{etab.code}</span>
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <form action={genererManquants}>
            <Button type="submit" data-testid="codes-generer">
              Générer les codes manquants
            </Button>
          </form>
          <ImprimerCodes />
        </div>
      </div>
      <p className="text-sm text-muted-foreground print:hidden">
        Chaque code a 5 caractères, est unique et reste valable tant qu&apos;il n&apos;est pas désactivé ou régénéré. {manquants > 0 ? manquants + " personne(s) n'ont pas encore de code." : "Tout le monde a un code."}
      </p>
      <Tableau
        titre={"Inscrits (" + inscrits.length + ")"}
        lignes={inscrits.map((i) => (
          <Ligne key={i.matricule} nom={i.firstName + " " + i.lastName} detail={i.matricule} cible="INSCRIT" code={i.codeAcces} />
        ))}
      />
      <Tableau
        titre={"Personnel RH (" + employes.length + ")"}
        lignes={employes.map((e) => (
          <Ligne key={e.matricule} nom={e.firstName + " " + e.lastName} detail={e.matricule + (e.poste ? " · " + e.poste : "")} cible="EMPLOYE" code={e.codeAcces} />
        ))}
      />
      <Tableau
        titre={"Parents (" + parents.length + ")"}
        lignes={parents.map((p) => (
          <Ligne key={p.id} nom={p.tuteurEmail ?? "?"} detail="Parent" cible="PARENT" code={p} />
        ))}
      />
    </div>
  )
}