import Link from "next/link"
import { redirect } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { accesFamille } from "@/lib/famille"
import { MESSAGES_ISSUE, crediterPaiement, type IssueCredit } from "@/lib/paystack"

const premier = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? ""

// Retour du navigateur depuis Paystack : le credit n'est jamais deduit de l'adresse, il est reverifie aupres de Paystack.
export async function RetourView({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await accesFamille()
  if (!session) redirect("/")
  const sp = await searchParams
  const reference = premier(sp.reference) || premier(sp.trxref)
  const p = reference ? await db.paiementEnLigne.findFirst({ where: { reference, userId: session.userId }, select: { reference: true, inscritId: true } }) : null
  const issue: IssueCredit = p ? await crediterPaiement(p.reference) : "INCONNU"
  const bon = issue === "CREDITE" || issue === "DEJA"
  return (
    <div className="flex flex-col gap-4">
      <Card data-testid="retour-paiement" data-issue={issue}>
        <CardHeader>
          <CardTitle className={bon ? "text-emerald-600" : issue === "EN_ATTENTE" || issue === "INDISPONIBLE" ? "text-amber-600" : "text-red-600"}>{bon ? "Paiement reçu" : "Paiement non confirmé"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p>{MESSAGES_ISSUE[issue]}</p>
          <Link href={p ? "/famille/" + p.inscritId : "/famille"} className="text-muted-foreground hover:underline">
            Retour au compte →
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}