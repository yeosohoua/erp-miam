import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { accesCompta } from "@/lib/compta-acces"
import { JOURNAUX, LISTE_COMPTES, ORDRE_JOURNAUX, PLAN, libelleCompte, moisPrecedent, moisSuivant, numeroEcriture, plageDe, type Journal } from "@/lib/compta-base"
import { planifier } from "@/lib/compta"
import { db } from "@/lib/db"
import { libellePeriode } from "@/lib/facturation-base"
import { aujourdhui, formaterMontant, versDate } from "@/lib/menus"

import { cloturerAction, comptabiliserAction, contrepasserAction, saisirEcriture } from "./actions"
import { ClotureForm, ComptabiliserForm, ContrepasseForm, SaisieForm } from "./formulaires"

type SP = Record<string, string | string[] | undefined>
type Cumul = { d: number; c: number }
type Rows = { compte: string; _sum: { debit: number | null; credit: number | null } }[]

const VUES = { journal: "Journal", balance: "Balance", "grand-livre": "Grand livre", resultat: "Résultat", cloture: "Clôture" } as const
type Vue = keyof typeof VUES

const un = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? ""
const versMap = (rows: Rows): Map<string, Cumul> => new Map<string, Cumul>(rows.map((r) => [r.compte, { d: r._sum.debit ?? 0, c: r._sum.credit ?? 0 }]))
function somme(m: Map<string, Cumul>, prefixes: string[], sens: "D" | "C"): number {
  let t = 0
  for (const [k, v] of m) if (prefixes.some((p) => k.startsWith(p))) t += sens === "D" ? v.d - v.c : v.c - v.d
  return t
}

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

export async function ComptabiliteView({ searchParams }: { searchParams: Promise<SP> }) {
  const acces = await accesCompta()
  if (!acces) redirect("/")
  const { etab, ecriture, cloture } = acces
  if (!etab) return <p className="text-sm text-destructive">Aucun établissement ne vous est affecté.</p>

  const sp = await searchParams
  const jour = aujourdhui()
  const vueBrute = un(sp.vue)
  const vue: Vue = Object.hasOwn(VUES, vueBrute) ? (vueBrute as Vue) : "journal"
  const plage = plageDe(un(sp.periode), jour)
  const debut = versDate(plage.debut)
  const fin = versDate(plage.fin)
  const dansPlage = { etablissementId: etab.id, date: { gte: debut, lt: fin } }
  const lien = (v: string, extra = ""): string => "/comptabilite?vue=" + v + "&periode=" + plage.code + extra

  const [info, prevus, clotures, periodeRows, cumulRows] = await Promise.all([
    db.etablissement.findUnique({ where: { id: etab.id }, select: { currency: true } }),
    planifier(db, etab.id),
    db.clotureCompta.findMany({ where: { etablissementId: etab.id }, orderBy: { periode: "desc" } }),
    db.ecritureLigne.groupBy({ by: ["compte"], where: { ecriture: dansPlage }, _sum: { debit: true, credit: true }, orderBy: { compte: "asc" } }),
    db.ecritureLigne.groupBy({ by: ["compte"], where: { ecriture: { etablissementId: etab.id, date: { lt: fin } } }, _sum: { debit: true, credit: true }, orderBy: { compte: "asc" } }),
  ])
  const devise = info?.currency ?? "XOF"
  const m = (n: number) => formaterMontant(n, devise)
  const periodeMap = versMap(periodeRows)
  const cumulMap = versMap(cumulRows)
  const produits = somme(periodeMap, ["7"], "C")
  const charges = somme(periodeMap, ["6"], "D")
  const solde = (d: number, c: number): string => (d > c ? m(d - c) + " D" : c > d ? m(c - d) + " C" : "—")

  const journalFiltre = Object.hasOwn(JOURNAUX, un(sp.journal)) ? (un(sp.journal) as Journal) : null
  const ecritures =
    vue === "journal"
      ? await db.ecritureCompta.findMany({
          where: { ...dansPlage, ...(journalFiltre ? { journal: journalFiltre } : {}) },
          orderBy: [{ date: "asc" }, { numero: "asc" }],
          take: 200,
          include: { lignes: { orderBy: { id: "asc" } } },
        })
      : []
  const contres = new Set<string | null>(vue === "journal" ? (await db.ecritureCompta.findMany({ where: { etablissementId: etab.id, sourceType: "CONTRE" }, select: { sourceId: true } })).map((e) => e.sourceId) : [])

  const compte = Object.hasOwn(PLAN, un(sp.compte)) ? un(sp.compte) : ""
  const lignesGL =
    vue === "grand-livre" && compte
      ? await db.ecritureLigne.findMany({
          where: { compte, ecriture: dansPlage },
          include: { ecriture: { select: { numero: true, date: true, journal: true, piece: true, libelle: true } } },
          orderBy: [{ ecriture: { date: "asc" } }, { ecriture: { numero: "asc" } }],
          take: 500,
        })
      : []
  const ouverture =
    vue === "grand-livre" && compte
      ? await db.ecritureLigne.aggregate({ where: { compte, ecriture: { etablissementId: etab.id, date: { lt: debut } } }, _sum: { debit: true, credit: true } })
      : null
  const derniere = clotures[0]?.periode ?? null
  const suggestion = derniere ? moisSuivant(derniere) : moisPrecedent(jour.slice(0, 7))

  return (
    <div className="flex flex-col gap-6" data-testid="compta-page">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Comptabilité</h2>
          <p className="text-sm text-muted-foreground">SYSCOHADA — {etab.name} — {plage.libelle}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
          <Link href={lien(vue, "").replace(/periode=[^&]*/, "periode=" + jour.slice(0, 4))} className="text-muted-foreground hover:underline">
            Cette année
          </Link>
          <Link href={lien(vue, "").replace(/periode=[^&]*/, "periode=tout")} className="text-muted-foreground hover:underline">
            Tout
          </Link>
          <form action="/comptabilite" method="get" className="flex items-center gap-2">
            <input type="hidden" name="vue" value={vue} />
            <input type="month" name="periode" defaultValue={/^\d{4}-\d{2}$/.test(plage.code) ? plage.code : jour.slice(0, 7)} className="h-9 rounded-md border bg-background px-2" />
            <button type="submit" className="h-9 rounded-md border px-3 hover:bg-muted">
              Afficher
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat titre="Produits" valeur={m(produits)} brut={produits} testid="kpi-produits" note="Classe 7 sur la période" />
        <Stat titre="Charges" valeur={m(charges)} brut={charges} testid="kpi-charges" note="Classe 6 sur la période" />
        <Stat titre="Résultat" valeur={m(produits - charges)} brut={produits - charges} testid="kpi-resultat" note="Produits moins charges" />
        <Stat titre="Trésorerie" valeur={m(somme(cumulMap, ["5"], "D"))} brut={somme(cumulMap, ["5"], "D")} testid="kpi-tresorerie" note="Caisse, banque, Mobile Money" />
        <Stat titre="Clients" valeur={m(somme(cumulMap, ["411"], "D"))} brut={somme(cumulMap, ["411"], "D")} testid="kpi-clients" note="Créances à encaisser (411)" />
        <Stat titre="Fournisseurs" valeur={m(somme(cumulMap, ["401"], "C"))} brut={somme(cumulMap, ["401"], "C")} testid="kpi-fournisseurs" note="Dettes à payer (401)" />
        <Stat titre="Stock" valeur={m(somme(cumulMap, ["32"], "D"))} brut={somme(cumulMap, ["32"], "D")} testid="kpi-stock" note="Denrées valorisées (321)" />
        <Stat titre="Avances reçues" valeur={m(somme(cumulMap, ["4191"], "C"))} brut={somme(cumulMap, ["4191"], "C")} testid="kpi-avances" note="Soldes prépayés des comptes (4191)" />
      </div>

      <Card data-testid="compta-attente" data-valeur={prevus.length}>
        <CardHeader>
          <CardTitle>Comptabilisation</CardTitle>
          <CardDescription>Factures, règlements, recharges, repas servis et mouvements de stock deviennent des écritures. Rejouable sans risque de doublon.</CardDescription>
        </CardHeader>
        <CardContent>{ecriture ? <ComptabiliserForm action={comptabiliserAction} attente={prevus.length} /> : <p className="text-sm text-muted-foreground">{prevus.length} pièce(s) en attente de comptabilisation.</p>}</CardContent>
      </Card>

      <div className="flex flex-wrap gap-4 border-b pb-2 text-sm">
        {(Object.keys(VUES) as Vue[]).map((v) => (
          <Link key={v} href={lien(v)} className={vue === v ? "font-medium" : "text-muted-foreground hover:underline"}>
            {VUES[v]}
          </Link>
        ))}
        <span className="ml-auto flex gap-3">
          <a href={"/api/comptabilite/export?type=journal&periode=" + plage.code} className="text-muted-foreground hover:underline">
            Exporter le journal (CSV)
          </a>
          <a href={"/api/comptabilite/export?type=balance&periode=" + plage.code} className="text-muted-foreground hover:underline">
            Exporter la balance (CSV)
          </a>
        </span>
      </div>

      {vue === "journal" ? (
        <>
          {ecriture ? (
            <Card>
              <CardHeader>
                <CardTitle>Saisir une écriture</CardTitle>
                <CardDescription>Règlement fournisseur, frais bancaires, régularisation... Deux comptes, un montant, équilibrée d&apos;office.</CardDescription>
              </CardHeader>
              <CardContent>
                <SaisieForm action={saisirEcriture} defaut={jour} />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Journal</CardTitle>
              <CardDescription>200 premières écritures de la période, dans l&apos;ordre chronologique.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-3 text-sm">
                <Link href={lien("journal")} className={journalFiltre ? "text-muted-foreground hover:underline" : "font-medium"}>
                  Tous
                </Link>
                {ORDRE_JOURNAUX.map((j) => (
                  <Link key={j} href={lien("journal", "&journal=" + j)} className={journalFiltre === j ? "font-medium" : "text-muted-foreground hover:underline"}>
                    {JOURNAUX[j]}
                  </Link>
                ))}
              </div>
              <table className="w-full text-sm" data-testid="journal">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Compte</th>
                    <th className="py-2 pr-4 font-medium">Libellé</th>
                    <th className="py-2 pr-4 text-right font-medium">Débit</th>
                    <th className="py-2 pr-4 text-right font-medium">Crédit</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                {ecritures.map((e) => {
                  const totalD = e.lignes.reduce((s, l) => s + l.debit, 0)
                  const lignesTriees = [...e.lignes].sort((a, b) => (b.debit > 0 ? 1 : 0) - (a.debit > 0 ? 1 : 0))
                  const contrepassable = ecriture && e.sourceType !== "CONTRE" && !contres.has(e.id)
                  return (
                    <tbody key={e.id} data-ecriture={e.id} data-numero={e.numero} data-journal={e.journal} data-source={e.sourceType ?? ""} data-debit={totalD} data-credit={totalD} data-libelle={e.libelle} className="border-b">
                      <tr className="bg-muted/40">
                        <td colSpan={4} className="py-2 pr-4">
                          <span className="font-medium">{numeroEcriture(e.numero)}</span> · {e.date.toISOString().slice(0, 10)} · <Badge variant="outline">{JOURNAUX[e.journal]}</Badge>
                          {e.piece ? " · " + e.piece : ""} — {e.libelle}
                        </td>
                        <td className="py-2 text-right">
                          {contrepassable ? <ContrepasseForm action={contrepasserAction.bind(null, e.id)} /> : e.sourceType === "CONTRE" ? <span className="text-xs text-muted-foreground">Contrepassation</span> : contres.has(e.id) ? <span className="text-xs text-muted-foreground">Contrepassée</span> : null}
                        </td>
                      </tr>
                      {lignesTriees.map((l) => (
                        <tr key={l.id}>
                          <td className="py-1 pr-4 pl-4 tabular-nums">{l.compte}</td>
                          <td className="py-1 pr-4 text-muted-foreground">{libelleCompte(l.compte)}</td>
                          <td className="py-1 pr-4 text-right tabular-nums">{l.debit > 0 ? m(l.debit) : ""}</td>
                          <td className="py-1 pr-4 text-right tabular-nums">{l.credit > 0 ? m(l.credit) : ""}</td>
                          <td />
                        </tr>
                      ))}
                    </tbody>
                  )
                })}
              </table>
              {ecritures.length === 0 ? <p className="text-sm text-muted-foreground">Aucune écriture sur cette période.</p> : null}
            </CardContent>
          </Card>
        </>
      ) : null}

      {vue === "balance" ? (
        <Card>
          <CardHeader>
            <CardTitle>Balance des comptes</CardTitle>
            <CardDescription>Mouvements de la période, par compte.</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm" data-testid="balance">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Compte</th>
                  <th className="py-2 pr-4 font-medium">Intitulé</th>
                  <th className="py-2 pr-4 text-right font-medium">Débit</th>
                  <th className="py-2 pr-4 text-right font-medium">Crédit</th>
                  <th className="py-2 pr-4 text-right font-medium">Solde</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {[...periodeMap.entries()].map(([k, v]) => (
                  <tr key={k} data-compte={k} data-debit={v.d} data-credit={v.c} className="border-b last:border-0">
                    <td className="py-2 pr-4 tabular-nums">{k}</td>
                    <td className="py-2 pr-4">{libelleCompte(k)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{m(v.d)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{m(v.c)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{solde(v.d, v.c)}</td>
                    <td className="py-2 text-right">
                      <Link href={lien("grand-livre", "&compte=" + k)} className="text-muted-foreground hover:underline">
                        Grand livre →
                      </Link>
                    </td>
                  </tr>
                ))}
                <tr
                  data-testid="balance-total"
                  data-debit={[...periodeMap.values()].reduce((s, v) => s + v.d, 0)}
                  data-credit={[...periodeMap.values()].reduce((s, v) => s + v.c, 0)}
                  className="font-medium"
                >
                  <td className="py-2 pr-4" colSpan={2}>
                    Total
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{m([...periodeMap.values()].reduce((s, v) => s + v.d, 0))}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{m([...periodeMap.values()].reduce((s, v) => s + v.c, 0))}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
            {periodeMap.size === 0 ? <p className="mt-3 text-sm text-muted-foreground">Aucun mouvement sur cette période.</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {vue === "grand-livre" ? (
        <Card>
          <CardHeader>
            <CardTitle>Grand livre</CardTitle>
            <CardDescription>Mouvements d&apos;un compte avec le solde cumulé.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form action="/comptabilite" method="get" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="vue" value="grand-livre" />
              <input type="hidden" name="periode" value={plage.code} />
              <select name="compte" defaultValue={compte} className="h-9 rounded-md border bg-background px-2">
                <option value="">Choisir un compte</option>
                {LISTE_COMPTES.map((c) => (
                  <option key={c.numero} value={c.numero}>
                    {c.numero} — {c.libelle}
                  </option>
                ))}
              </select>
              <button type="submit" className="h-9 rounded-md border px-3 hover:bg-muted">
                Afficher
              </button>
            </form>
            {compte ? (
              (() => {
                const ouvD = ouverture?._sum.debit ?? 0
                const ouvC = ouverture?._sum.credit ?? 0
                let cumul = ouvD - ouvC
                return (
                  <>
                    <table className="w-full text-sm" data-testid="grand-livre">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 pr-4 font-medium">Date</th>
                          <th className="py-2 pr-4 font-medium">Écriture</th>
                          <th className="py-2 pr-4 font-medium">Libellé</th>
                          <th className="py-2 pr-4 text-right font-medium">Débit</th>
                          <th className="py-2 pr-4 text-right font-medium">Crédit</th>
                          <th className="py-2 text-right font-medium">Solde</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ouvD + ouvC > 0 ? (
                          <tr className="border-b text-muted-foreground">
                            <td className="py-2 pr-4" colSpan={5}>
                              Report à l&apos;ouverture de la période
                            </td>
                            <td className="py-2 text-right tabular-nums">{solde(ouvD, ouvC)}</td>
                          </tr>
                        ) : null}
                        {lignesGL.map((l) => {
                          cumul += l.debit - l.credit
                          return (
                            <tr key={l.id} data-ligne={l.id} data-debit={l.debit} data-credit={l.credit} className="border-b last:border-0">
                              <td className="py-2 pr-4">{l.ecriture.date.toISOString().slice(0, 10)}</td>
                              <td className="py-2 pr-4">{numeroEcriture(l.ecriture.numero)}</td>
                              <td className="py-2 pr-4">{l.ecriture.libelle}</td>
                              <td className="py-2 pr-4 text-right tabular-nums">{l.debit > 0 ? m(l.debit) : ""}</td>
                              <td className="py-2 pr-4 text-right tabular-nums">{l.credit > 0 ? m(l.credit) : ""}</td>
                              <td className="py-2 text-right tabular-nums">{cumul >= 0 ? m(cumul) + " D" : m(-cumul) + " C"}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <p className="text-sm font-medium" data-testid="gl-solde" data-valeur={cumul}>
                      Solde du compte {compte} : {cumul >= 0 ? m(cumul) + " débiteur" : m(-cumul) + " créditeur"}
                    </p>
                  </>
                )
              })()
            ) : (
              <p className="text-sm text-muted-foreground">Choisissez un compte.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {vue === "resultat" ? (
        <Card>
          <CardHeader>
            <CardTitle>Compte de résultat</CardTitle>
            <CardDescription>Produits (classe 7) et charges (classe 6) de la période.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2" data-testid="resultat">
            {(
              [
                ["Produits", "7", "C"],
                ["Charges", "6", "D"],
              ] as const
            ).map(([titre, classe, sens]) => (
              <div key={classe} className="flex flex-col gap-2">
                <h3 className="font-medium">{titre}</h3>
                <table className="w-full text-sm">
                  <tbody>
                    {[...periodeMap.entries()]
                      .filter(([k]) => k.startsWith(classe))
                      .map(([k, v]) => (
                        <tr key={k} className="border-b last:border-0">
                          <td className="py-2 pr-4 tabular-nums">{k}</td>
                          <td className="py-2 pr-4">{libelleCompte(k)}</td>
                          <td className="py-2 text-right tabular-nums">{m(sens === "C" ? v.c - v.d : v.d - v.c)}</td>
                        </tr>
                      ))}
                    <tr className="font-medium">
                      <td className="py-2 pr-4" colSpan={2}>
                        Total {titre.toLowerCase()}
                      </td>
                      <td className="py-2 text-right tabular-nums">{m(somme(periodeMap, [classe], sens))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
            <p className="text-base font-semibold md:col-span-2">
              Résultat de la période : {m(produits - charges)} {produits - charges >= 0 ? "(excédent)" : "(déficit)"}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {vue === "cloture" ? (
        <Card>
          <CardHeader>
            <CardTitle>Clôture des périodes</CardTitle>
            <CardDescription>Un mois clôturé est verrouillé : plus de saisie à ces dates, les pièces tardives sont rattachées au mois ouvert. Les mois se clôturent dans l&apos;ordre.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {cloture ? <ClotureForm action={cloturerAction} defaut={suggestion} /> : <p className="text-sm text-muted-foreground">La clôture est réservée à l&apos;administrateur et au comptable.</p>}
            <table className="w-full text-sm" data-testid="clotures">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Période</th>
                  <th className="py-2 pr-4 font-medium">Clôturée le</th>
                  <th className="py-2 font-medium">Par</th>
                </tr>
              </thead>
              <tbody>
                {clotures.map((c) => (
                  <tr key={c.periode} data-periode={c.periode} className="border-b last:border-0">
                    <td className="py-2 pr-4 capitalize">{libellePeriode(c.periode)}</td>
                    <td className="py-2 pr-4">{c.clotureLe.toISOString().slice(0, 10)}</td>
                    <td className="py-2">{c.clotureePar ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {clotures.length === 0 ? <p className="text-sm text-muted-foreground">Aucune période clôturée.</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}