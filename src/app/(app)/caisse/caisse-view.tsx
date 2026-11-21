import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { accesCaisse } from "@/lib/caisse-acces"
import { mouvementsEspeces } from "@/lib/caisse-tiroir"
import { MODES, ORDRE_MODES, especesAttendues, numeroTicket, periodeValide, rapportParCaissier, ventiler } from "@/lib/caisse-base"
import { db } from "@/lib/db"
import { aujourdhui, formaterNombre, versDate } from "@/lib/menus"

import { annulerVente, basculerArticle } from "./actions"
import { RemboursementFormulaire } from "./remboursement-form"
import { CaisseEcran } from "./caisse-ecran"
import { ArticleFormulaire, CloturerFormulaire, ImageArticle, OuvrirFormulaire, PrixFormulaire } from "./formulaires"
import { retirerImageArticle } from "./images-actions"
import { basculerObligationSession } from "./session-actions"

type SP = Record<string, string | string[] | undefined>
const un = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? ""
const f = (n: number): string => formaterNombre(n) + " FCFA"
const signe = (n: number): string => (n > 0 ? "+" : "") + n
const heure = (d: Date): string => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(d)

function Section({ titre, aide, children }: { titre: string; aide?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="text-lg font-semibold">{titre}</h2>
        {aide ? <p className="text-sm text-muted-foreground">{aide}</p> : null}
      </div>
      {children}
    </section>
  )
}

export async function CaisseView({ searchParams }: { searchParams: Promise<SP> }) {
  const a = await accesCaisse()
  if (!a) return <div data-testid="acces-refuse" className="text-muted-foreground">La caisse est réservée au caissier, au gestionnaire et à l&apos;administrateur.</div>
  if (!a.etab) return <p className="text-muted-foreground">Aucun établissement actif.</p>
  const etabId = a.etab.id
  const sp = await searchParams
  const debutJour = versDate(aujourdhui())

  const [articles, ventes, agg, reglage, miens, sessions] = await Promise.all([
    db.articleCarte.findMany({ where: { etablissementId: etabId }, orderBy: [{ categorie: "asc" }, { nom: "asc" }] }),
    db.venteComptoir.findMany({ where: { etablissementId: etabId, createdAt: { gte: debutJour } }, orderBy: { numero: "desc" }, take: 50, include: { lignes: true, remboursements: { select: { montant: true } } } }),
    db.venteComptoir.aggregate({ where: { etablissementId: etabId, createdAt: { gte: debutJour }, statut: "PAYEE" }, _sum: { total: true }, _count: { _all: true } }),
    db.etablissement.findUnique({ where: { id: etabId }, select: { sessionCaisseObligatoire: true } }),
    db.sessionCaisse.findFirst({ where: { etablissementId: etabId, caissierEmail: a.session.email, statut: "OUVERTE" }, include: { ventes: { select: { methode: true, statut: true, total: true, partCompte: true } } } }),
    db.sessionCaisse.findMany({
      where: { etablissementId: etabId, ...(a.config ? {} : { caissierEmail: a.session.email }) },
      orderBy: { numero: "desc" },
      take: 15,
      include: { ventes: { select: { methode: true, statut: true, total: true, partCompte: true } } },
    }),
  ])
  const obligatoire = reglage?.sessionCaisseObligatoire ?? false
  const ids = [...new Set(ventes.flatMap((v) => (v.inscritId ? [v.inscritId] : [])))]
  const inscrits = ids.length ? await db.inscrit.findMany({ where: { etablissementId: etabId, id: { in: ids } }, select: { id: true, matricule: true, firstName: true, lastName: true } }) : []
  const parInscrit = new Map(inscrits.map((i) => [i.id, i]))

  let attenduMienne = 0
  if (miens) attenduMienne = especesAttendues(miens.fondInitial, (ventiler(miens.ventes).parMode.CASH?.total ?? 0) + (await mouvementsEspeces(db, miens)))
  const mvt = new Map<string, number>()
  for (const s of sessions) if (s.statut === "OUVERTE") mvt.set(s.id, await mouvementsEspeces(db, s))

  // Rapport par caissier (gestionnaire) : periode choisie, aujourd'hui par defaut.
  const jour = aujourdhui()
  const du = un(sp.du) || jour
  const au = un(sp.au) || jour
  const periode = periodeValide(du, au)
  const rapport = a.config && periode
    ? rapportParCaissier(
        (
          await db.venteComptoir.groupBy({
            by: ["createdBy", "methode", "statut"],
            where: { etablissementId: etabId, createdAt: { gte: versDate(periode.du), lt: new Date(versDate(periode.au).getTime() + 864e5) } },
            _sum: { total: true, partCompte: true },
            _count: { _all: true },
          })
        ).flatMap((r) => { const pc = r._sum.partCompte ?? 0; const base = { caissier: r.createdBy, methode: r.methode, statut: r.statut, nb: r._count._all, total: (r._sum.total ?? 0) - pc }; return pc > 0 ? [base, { caissier: r.createdBy, methode: null, statut: r.statut, nb: 0, total: pc }] : [base] }),
      )
    : []

  return (
    <div className="space-y-6" data-testid="caisse-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Caisse</h1>
          <p className="text-sm text-muted-foreground">Vente à la carte au comptoir : compte prépayé (badge, bracelet NFC), espèces ou Mobile Money.</p>
        </div>
        <div className="flex gap-3 text-right">
          <div className="rounded-lg border px-3 py-2">
            <p className="text-xs text-muted-foreground">Ventes du jour</p>
            <p className="text-lg font-semibold" data-testid="kpi-ventes-jour">{agg._count._all}</p>
          </div>
          <div className="rounded-lg border px-3 py-2">
            <p className="text-xs text-muted-foreground">Encaissé aujourd&apos;hui</p>
            <p className="text-lg font-semibold" data-testid="kpi-ca-jour" data-valeur={agg._sum.total ?? 0}>{f(agg._sum.total ?? 0)}</p>
          </div>
        </div>
      </div>

      <Section titre="Ma caisse" aide={obligatoire ? "L'ouverture de la caisse est obligatoire pour encaisser dans cet établissement." : "L'ouverture de la caisse n'est pas obligatoire, mais elle permet de contrôler les espèces en fin de service."}>
        {miens ? (
          <div data-testid="session-courante" data-numero={miens.numero} data-attendu={attenduMienne} className="flex flex-wrap gap-6 text-sm">
            <p>Caisse n° <strong>{miens.numero}</strong> ouverte à {heure(miens.ouverteLe)}</p>
            <p>Fond : <strong>{f(miens.fondInitial)}</strong></p>
            <p>Espèces attendues : <strong>{f(attenduMienne)}</strong></p>
          </div>
        ) : (
          <OuvrirFormulaire />
        )}
        {a.config ? (
          <form action={basculerObligationSession} className="flex flex-wrap items-center gap-3">
            <p data-testid="obligation-etat" data-valeur={obligatoire ? "oui" : "non"} className="text-sm text-muted-foreground">
              Ouverture obligatoire : <strong>{obligatoire ? "oui" : "non"}</strong>
            </p>
            <Button type="submit" size="sm" variant="outline">{obligatoire ? "Ne plus exiger l'ouverture de la caisse" : "Exiger l'ouverture de la caisse"}</Button>
          </form>
        ) : null}
      </Section>

      <CaisseEcran peutRemise={a.config} etabId={a.etab.id} userId={a.session.userId} etablissement={a.etab.name} articles={articles.filter((x) => x.active).map((x) => ({ id: x.id, nom: x.nom, prix: x.prix, categorie: x.categorie, imageId: x.imageId }))} />

      <Section titre="Ventes du jour" aide="Les 50 dernières. Une vente annulée rembourse le compte prépayé ou est contrepassée en comptabilité.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="ventes">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3">Ticket</th><th className="pr-3">Heure</th><th className="pr-3">Client</th><th className="pr-3">Paiement</th><th className="pr-3">Articles</th><th className="pr-3">Total</th><th className="pr-3">Statut</th><th />
              </tr>
            </thead>
            <tbody>
              {ventes.length === 0 ? <tr><td colSpan={8} className="py-4 text-muted-foreground">Aucune vente aujourd&apos;hui.</td></tr> : null}
              {ventes.map((v) => {
                const i = v.inscritId ? parInscrit.get(v.inscritId) : null
                return (
                  <tr key={v.id} className="border-b last:border-0" data-vente={v.id} data-numero={v.numero} data-statut={v.statut} data-total={v.total} data-methode={v.methode ?? "COMPTE"}>
                    <td className="py-2 pr-3 font-medium">{numeroTicket(v.numero)}</td>
                    <td className="pr-3">{heure(v.createdAt)}</td>
                    <td className="pr-3">{i ? `${i.matricule} — ${i.firstName} ${i.lastName}` : (v.visiteur ?? "Visiteur")}</td>
                    <td className="pr-3">{(MODES as Record<string, string>)[v.methode ?? "COMPTE"] ?? v.methode}</td>
                    <td className="pr-3 text-muted-foreground">{v.lignes.map((l) => `${l.quantite} × ${l.libelle}`).join(", ")}</td>
                    <td className="pr-3">{f(v.total)}{v.remboursements.length > 0 ? <span className="block text-xs text-muted-foreground" data-rembourse={v.remboursements.reduce((s, r) => s + r.montant, 0)}>dont remboursé : {f(v.remboursements.reduce((s, r) => s + r.montant, 0))}</span> : null}</td>
                    <td className="pr-3"><Badge variant={v.statut === "PAYEE" ? "secondary" : "outline"}>{v.statut === "PAYEE" ? "Payée" : "Annulée"}</Badge></td>
                    <td>
                      <div className="flex items-center gap-1">
                        <a href={"/impression-ticket/" + v.numero} target="_blank" rel="noreferrer" className="rounded-md px-2 py-1 text-sm underline" data-testid="lien-ticket">Ticket</a>
                        {a.annulation && v.statut === "PAYEE" && v.total - v.remboursements.reduce((s, r) => s + r.montant, 0) > 0 ? <RemboursementFormulaire venteId={v.id} reste={v.total - v.remboursements.reduce((s, r) => s + r.montant, 0)} /> : null}
                        {a.annulation && v.statut === "PAYEE" ? (
                          <form action={annulerVente.bind(null, v.id)}>
                            <Button type="submit" size="sm" variant="ghost">Annuler</Button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section titre="Caisses ouvertes et clôturées" aide={a.config ? "Toutes les caisses de l'établissement. Le rapport Z s'imprime depuis chaque ligne." : "Vos dernières caisses. Le rapport Z s'imprime depuis chaque ligne."}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="sessions">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3">N°</th><th className="pr-3">Caissier</th><th className="pr-3">État</th><th className="pr-3">Fond</th><th className="pr-3">Attendu</th><th className="pr-3">Compté</th><th className="pr-3">Écart</th><th />
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? <tr><td colSpan={8} className="py-4 text-muted-foreground">Aucune caisse ouverte pour l&apos;instant.</td></tr> : null}
              {sessions.map((s) => {
                const attendu = s.especesAttendues ?? especesAttendues(s.fondInitial, (ventiler(s.ventes).parMode.CASH?.total ?? 0) + (mvt.get(s.id) ?? 0))
                const ouverte = s.statut === "OUVERTE"
                return (
                  <tr key={s.id} className="border-b last:border-0" data-session={s.numero} data-statut={s.statut} data-attendu={attendu} data-ecart={s.ecart ?? ""}>
                    <td className="py-2 pr-3 font-medium">{s.numero}</td>
                    <td className="pr-3">{s.caissierEmail}</td>
                    <td className="pr-3"><Badge variant={ouverte ? "secondary" : "outline"}>{ouverte ? "Ouverte" : "Clôturée"}</Badge></td>
                    <td className="pr-3">{f(s.fondInitial)}</td>
                    <td className="pr-3">{f(attendu)}</td>
                    <td className="pr-3">{s.especesComptees !== null ? f(s.especesComptees) : "—"}</td>
                    <td className="pr-3">{s.ecart !== null ? signe(s.ecart) + " FCFA" : "—"}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <a href={"/impression-caisse/" + s.id} target="_blank" rel="noreferrer" className="rounded-md px-2 py-1 text-sm underline">Rapport Z</a>
                        {ouverte && (a.config || s.caissierEmail === a.session.email) ? <CloturerFormulaire id={s.id} /> : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {a.config ? (
        <Section titre="Rapport par caissier" aide="Ventes encaissées et annulées par caissier et par mode de paiement, sur la période choisie (366 jours au plus).">
          <form method="get" action="/caisse" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">Du<input id="rp-du" name="du" type="date" defaultValue={du} className="h-9 rounded-md border bg-background px-3" /></label>
            <label className="flex flex-col gap-1 text-sm">Au<input id="rp-au" name="au" type="date" defaultValue={au} className="h-9 rounded-md border bg-background px-3" /></label>
            <Button type="submit" variant="outline">Afficher</Button>
          </form>
          {periode ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="rapport-caissiers">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3">Caissier</th><th className="pr-3">Ventes</th>
                    {ORDRE_MODES.map((m) => <th key={m} className="pr-3">{MODES[m]}</th>)}
                    <th className="pr-3">Total encaissé</th><th className="pr-3">Annulées</th>
                  </tr>
                </thead>
                <tbody>
                  {rapport.length === 0 ? <tr><td colSpan={ORDRE_MODES.length + 4} className="py-4 text-muted-foreground">Aucune vente sur cette période.</td></tr> : null}
                  {rapport.map((r) => (
                    <tr key={r.caissier} className="border-b last:border-0" data-caissier={r.caissier} data-nb={r.nb} data-total={r.total} data-annulees={r.annulees}>
                      <td className="py-2 pr-3 font-medium">{r.caissier}</td>
                      <td className="pr-3">{r.nb}</td>
                      {ORDRE_MODES.map((m) => <td key={m} className="pr-3">{r.parMode[m] ? f(r.parMode[m].total) : "—"}</td>)}
                      <td className="pr-3 font-medium">{f(r.total)}</td>
                      <td className="pr-3">{r.annulees} ({f(r.montantAnnule)})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p role="alert" data-testid="rapport-erreur" className="text-sm text-destructive">Période invalide : deux dates réelles, la première avant la seconde, 366 jours au plus.</p>
          )}
        </Section>
      ) : null}

      {a.config ? (
        <Section titre="Articles en vente" aide="Un article désactivé disparaît de la caisse mais reste dans l'historique des ventes. Les images sont réduites automatiquement avant l'envoi.">
          <ArticleFormulaire />
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="articles">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3">Article</th><th className="pr-3">Image</th><th className="pr-3">Catégorie</th><th className="pr-3">Prix</th><th className="pr-3">Statut</th><th />
                </tr>
              </thead>
              <tbody>
                {articles.length === 0 ? <tr><td colSpan={6} className="py-4 text-muted-foreground">Aucun article.</td></tr> : null}
                {articles.map((x) => (
                  <tr key={x.id} className="border-b last:border-0" data-article-ligne={x.nom} data-prix={x.prix} data-active={x.active ? "oui" : "non"} data-image={x.imageId ? "oui" : "non"}>
                    <td className="py-2 pr-3 font-medium">{x.nom}</td>
                    <td className="pr-3">
                      <div className="flex items-center gap-2">
                        <ImageArticle key={x.id + "-" + (x.imageId ?? "")} id={x.id} imageId={x.imageId} nom={x.nom} />
                        {x.imageId ? (
                          <form action={retirerImageArticle.bind(null, x.id)}>
                            <Button type="submit" size="sm" variant="ghost">Retirer l&apos;image</Button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                    <td className="pr-3 text-muted-foreground">{x.categorie ?? "—"}</td>
                    <td className="pr-3"><PrixFormulaire key={x.id + "-" + x.prix} id={x.id} prix={x.prix} /></td>
                    <td className="pr-3"><Badge variant={x.active ? "secondary" : "outline"}>{x.active ? "En vente" : "Désactivé"}</Badge></td>
                    <td>
                      <form action={basculerArticle.bind(null, x.id)}>
                        <Button type="submit" size="sm" variant="ghost">{x.active ? "Désactiver" : "Activer"}</Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}
    </div>
  )
}