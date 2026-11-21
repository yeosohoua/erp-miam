import { Bell, Building2, Tags, Database, KeyRound, ScrollText, UserCog, Users } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { contexteEtablissement } from "@/lib/etablissement"
import { requireSession } from "@/lib/guards"
import { AUDIT_LECTURE, CAISSE_CONFIG, ETABLISSEMENTS_ADMIN, ETABLISSEMENT_EDITION, PARAMETRES_ADMIN, PARAMETRES_LECTURE, SAUVEGARDE_ADMIN, UTILISATEURS_ADMIN, hasRole } from "@/lib/permissions"

export async function ParametresView() {
  const session = await requireSession()
  if (!hasRole(session.role, PARAMETRES_LECTURE)) redirect("/")
  const { courant } = await contexteEtablissement()

  const cartes: { href: string; titre: string; description: string; icone: typeof Users }[] = []
  if (hasRole(session.role, ETABLISSEMENTS_ADMIN)) {
    cartes.push({ href: "/parametres/etablissements", titre: "Établissements", description: "Écoles, entreprises et autres sites : création, coordonnées, activation.", icone: Building2 })
  } else if (hasRole(session.role, ETABLISSEMENT_EDITION) && courant) {
    cartes.push({ href: "/parametres/etablissements/" + courant.id, titre: "Mon établissement", description: "Coordonnées et devise de l'établissement actif.", icone: Building2 })
  }
  if (hasRole(session.role, UTILISATEURS_ADMIN)) {
    cartes.push({ href: "/parametres/utilisateurs", titre: "Utilisateurs", description: "Comptes, rôles et affectation aux établissements.", icone: UserCog })
  }
  if (hasRole(session.role, SAUVEGARDE_ADMIN)) {
    cartes.push({ href: "/parametres/sauvegardes", titre: "Sauvegardes", description: "Exporter les données et restaurer une sauvegarde.", icone: Database })
  }
  if (hasRole(session.role, PARAMETRES_ADMIN)) {
    cartes.push({ href: "/parametres/configuration", titre: "Configuration", description: "Clés et serveurs (Paystack, Twilio, WhatsApp, SMTP) enregistrés de façon chiffrée.", icone: KeyRound })
  }
  if (hasRole(session.role, CAISSE_CONFIG)) {
    cartes.push({ href: "/parametres/categories-articles", titre: "Catégories d'articles", description: "Catégories affichées dans l'application mobile pour les articles de la caisse.", icone: Tags })
  }
  cartes.push({ href: "/parametres/notifications", titre: "Notifications", description: "SMS, WhatsApp et e-mail : canaux, événements et journal d'envoi.", icone: Bell })
  if (hasRole(session.role, AUDIT_LECTURE)) {
    cartes.push({ href: "/parametres/audit", titre: "Journal d'audit", description: "Historique des connexions et des opérations sensibles.", icone: ScrollText })
  }

  return (
    <>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Paramètres</h2>
        <p className="text-sm text-muted-foreground">Configuration de l&apos;installation.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="cartes-parametres">
        {cartes.map((c) => (
          <Link key={c.href} href={c.href}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <c.icone className="mb-2 size-5 text-muted-foreground" />
                <CardTitle>{c.titre}</CardTitle>
                <CardDescription>{c.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </>
  )
}