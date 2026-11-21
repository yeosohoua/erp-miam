"use client"

import { useEffect, useRef, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MODES, ORDRE_MODES, QTE_MAX, numeroTicket, type ModeCaisse } from "@/lib/caisse-base"
import { formaterNombre } from "@/lib/menus"
import { CurseurCobalt } from "@/components/curseur-cobalt"
import { ScanCamera } from "@/components/scan-camera"
import { definirSon, jouer, sonActif } from "@/lib/sons-caisse"

import { encaisserVente } from "./actions"
import { nouvelleCle, useCaisseHorsLigne } from "./caisse-hors-ligne"
import { synchroniserVentes } from "./hors-ligne-actions"
import { RecuImprimante, type TicketCaisse } from "./recu-imprimante"

type Article = { id: string; nom: string; prix: number; categorie: string | null; imageId: string | null }
type Resultat = { numero: number; total: number; solde: number | null }
const f = (n: number): string => formaterNombre(n) + " FCFA"

export function CaisseEcran({ articles, etablissement, peutRemise, etabId, userId }: { articles: Article[]; etablissement: string; peutRemise: boolean; etabId: string; userId: string }) {
  const [panier, setPanier] = useState<Record<string, number>>({})
  const [mode, setMode] = useState<ModeCaisse>("COMPTE")
  const [identifiant, setIdentifiant] = useState("")
  const [visiteur, setVisiteur] = useState("")
  const [recu, setRecu] = useState("")
  const [remise, setRemise] = useState("")
  const [partTxt, setPartTxt] = useState("")
  const [erreur, setErreur] = useState<string | null>(null)
  const [resultat, setResultat] = useState<Resultat | null>(null)
  const [ticket, setTicket] = useState<TicketCaisse | null>(null)
  const [attente, demarrer] = useTransition()
  const champ = useRef<HTMLInputElement>(null)
  const zone = useRef<HTMLDivElement>(null)
  const [son, setSon] = useState(true)
  useEffect(() => {
    setSon(sonActif())
  }, [])
  const hl = useCaisseHorsLigne({ etabId, userId, synchroniser: synchroniserVentes })
  const [info, setInfo] = useState<string | null>(null)

  const parId = new Map(articles.map((a) => [a.id, a]))
  const lignes = Object.entries(panier).flatMap(([id, q]) => {
    const a = parId.get(id)
    return a && q > 0 ? [{ a, q }] : []
  })
  const brut = lignes.reduce((t, l) => t + l.a.prix * l.q, 0)
  const pct = peutRemise && /^\d{1,3}$/.test(remise.trim()) ? Math.min(100, Number(remise.trim())) : 0
  const montantRemise = Math.round((brut * pct) / 100)
  const total = brut - montantRemise
  const part = mode !== "COMPTE" && /^\d{1,9}$/.test(partTxt.trim()) ? Number(partTxt.trim()) : 0
  const aRegler = total - part
  const recuNum = mode === "CASH" && /^\d{1,9}$/.test(recu.trim()) ? Number(recu.trim()) : null
  const renduAffiche = recuNum !== null && recuNum >= aRegler && aRegler > 0 ? recuNum - aRegler : null

  const groupes = new Map<string, Article[]>()
  for (const a of articles) groupes.set(a.categorie ?? "Autres", [...(groupes.get(a.categorie ?? "Autres") ?? []), a])

  const ajouter = (id: string) => {
    setResultat(null)
    setTicket(null)
    setErreur(null)
    setPanier((p) => ({ ...p, [id]: Math.min(QTE_MAX, (p[id] ?? 0) + 1) }))
    jouer("ajout")
  }
  const retirerSansSon = (id: string) =>
    setPanier((p) => {
      const q = (p[id] ?? 0) - 1
      const s = { ...p }
      if (q <= 0) delete s[id]
      else s[id] = q
      return s
    })
  const retirer = (id: string) => {
    jouer("retrait")
    retirerSansSon(id)
  }
  const supprimer = (id: string) =>
    setPanier((p) => {
      const s = { ...p }
      delete s[id]
      return s
    })

  const valider = () => {
    if (lignes.length === 0 || attente) return
    setInfo(null)
    setErreur(null)
    if (part > 0 && part >= total) {
      setErreur("La part sur compte doit être inférieure au total.")
      return
    }
    if (mode === "CASH" && recu.trim() !== "" && recuNum === null) {
      setErreur("Montant reçu invalide.")
      return
    }
    if (recuNum !== null && recuNum < aRegler) {
      setErreur("Le montant reçu est inférieur au total.")
      return
    }
    const instantane = lignes.map((l) => ({ nom: l.a.nom, qty: l.q, total: l.a.prix * l.q }))
    const modeLibelle = MODES[mode] + (part > 0 ? " + Compte" : "")
    const mettreEnFile = (cle: string, raison: string): void => {
      if (mode === "COMPTE" || part > 0) {
        setErreur(raison + " Le paiement sur compte nécessite la connexion : choisissez espèces ou Mobile Money, ou vérifiez « Ventes du jour » avant de recommencer.")
        return
      }
      const libelle = hl.ajouter({ cle, at: Date.now(), mode, visiteur, recu: recuNum, pct, total, lignes: lignes.map((l) => ({ articleId: l.a.id, nom: l.a.nom, quantite: l.q, prix: l.a.prix })) })
      if (!libelle) {
        setErreur("Impossible de garder la vente sur cet appareil (stockage plein ou 100 ventes en attente).")
        return
      }
      setInfo("Vente " + libelle + " enregistrée sur cet appareil : elle sera synchronisée au retour de la connexion.")
      setResultat(null)
      setTicket({
        numero: 0,
        libelle,
        etablissement,
        date: new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date()),
        lignes: instantane,
        total,
        modeLibelle: modeLibelle + " (hors ligne)",
        recu: recuNum,
        rendu: recuNum !== null ? recuNum - aRegler : null,
        remise: montantRemise,
        solde: null,
      })
      setPanier({})
      setIdentifiant("")
      setVisiteur("")
      setRecu("")
      setRemise("")
      setPartTxt("")
    }
    demarrer(async () => {
      const cle = nouvelleCle()
      const r = hl.enLigne ? await encaisserVente(lignes.map((l) => ({ articleId: l.a.id, quantite: l.q })), mode, identifiant, visiteur, recuNum ?? undefined, pct, part, cle).catch(() => null) : null
      if (r === null) {
        mettreEnFile(cle, hl.enLigne ? "Connexion interrompue." : "Hors ligne.")
        return
      }
      if ("erreur" in r) {
        setErreur(r.erreur)
        jouer("erreur")
        return
      }
      setResultat({ numero: r.numero, total: r.total, solde: r.solde })
      jouer("succes")
      setTicket({
        numero: r.numero,
        libelle: numeroTicket(r.numero),
        etablissement,
        date: new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date()),
        lignes: instantane,
        total: r.total,
        modeLibelle,
        recu: recuNum,
        rendu: r.rendu,
        remise: montantRemise,
        solde: r.solde,
      })
      setPanier({})
      setIdentifiant("")
      setVisiteur("")
      setRecu("")
      setRemise("")
      setPartTxt("")
      champ.current?.focus()
    })
  }

  return (
    <div ref={zone} className="grid gap-4 lg:grid-cols-[1fr_380px]" data-testid="caisse-ecran">
      <CurseurCobalt zone={zone} />
      <div className="space-y-4">
        {articles.length === 0 ? <p className="text-muted-foreground">Aucun article en vente : le gestionnaire doit en ajouter.</p> : null}
        {[...groupes.entries()].map(([categorie, liste]) => (
          <div key={categorie}>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">{categorie}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {liste.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  data-article={a.nom}
                  data-curseur="carte"
                  onClick={() => ajouter(a.id)}
                  className="group flex cursor-none flex-col rounded-[28px] border bg-card p-2 text-left shadow-sm transition hover:shadow-md active:scale-[0.98]"
                >
                  <span className="relative block overflow-hidden rounded-[22px] bg-muted/60">
                    <span className="flex aspect-[4/3] w-full items-center justify-center p-3">
                      {a.imageId ? (
                        <img src={"/api/images/" + a.imageId} alt="" loading="lazy" className="max-h-full max-w-full object-contain transition duration-300 group-hover:scale-105" />
                      ) : (
                        <span aria-hidden="true" className="text-5xl font-semibold text-muted-foreground/40">{a.nom.slice(0, 1).toUpperCase()}</span>
                      )}
                    </span>
                    <span className="absolute right-0 top-0 rounded-bl-2xl bg-card px-4 py-2 text-base font-semibold tabular-nums">{f(a.prix)}</span>
                  </span>
                  <span className="block px-3 pb-2 pt-3">
                    <span className="block text-lg font-semibold leading-tight">{a.nom}</span>
                    <span className="block text-sm text-muted-foreground">{a.categorie ?? "Autres"}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <aside className="space-y-4 rounded-xl border bg-card p-4 lg:sticky lg:top-4 lg:self-start">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Ticket</h2>
          <button
            type="button"
            data-testid="son-bascule"
            aria-pressed={son}
            onClick={() => {
              const v = !son
              definirSon(v)
              setSon(v)
              if (v) jouer("ajout")
            }}
            className="h-8 rounded-md border px-3 text-xs"
          >
            {son ? "Son activé" : "Son coupé"}
          </button>
        </div>
        {!hl.enLigne || hl.attente > 0 || hl.rejets.length > 0 ? (
          <div data-testid="hl-etat" data-en-ligne={hl.enLigne ? "1" : "0"} data-attente={hl.attente} className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            {!hl.enLigne ? <p>Hors ligne : les ventes en espèces et Mobile Money sont gardées sur cet appareil. Le paiement sur compte nécessite la connexion.</p> : null}
            {hl.attente > 0 ? <p>{hl.attente} vente(s) en attente de synchronisation. Synchronisez avant de clôturer la caisse.</p> : null}
            {hl.attente > 0 && hl.enLigne ? (
              <button type="button" onClick={() => void hl.synchroniser()} disabled={hl.occupe} className="rounded-md border border-amber-400 px-2 py-1">
                Synchroniser maintenant
              </button>
            ) : null}
            {hl.rejets.map((r) => (
              <p key={r.cle} data-rejet={r.libelle} className="text-destructive">
                {r.libelle} refusée : {r.erreur}{" "}
                <button type="button" onClick={() => hl.ecarter(r.cle)} className="underline">
                  Écarter
                </button>
              </p>
            ))}
          </div>
        ) : null}
        <ul className="space-y-2" data-testid="panier">
          {lignes.length === 0 ? <li className="text-sm text-muted-foreground">Touchez un article pour commencer.</li> : null}
          {lignes.map(({ a, q }) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-sm" data-panier-ligne={a.nom} data-quantite={q}>
              <span className="min-w-0 flex-1 truncate">{a.nom}</span>
              <span className="flex items-center gap-1">
                <Button type="button" size="sm" variant="outline" aria-label={"Retirer un " + a.nom} onClick={() => retirer(a.id)}>−</Button>
                <span className="w-6 text-center tabular-nums">{q}</span>
                <Button type="button" size="sm" variant="outline" aria-label={"Ajouter un " + a.nom} onClick={() => ajouter(a.id)}>+</Button>
              </span>
              <span className="w-24 text-right tabular-nums">{f(a.prix * q)}</span>
              <Button type="button" size="sm" variant="ghost" aria-label={"Supprimer " + a.nom} onClick={() => supprimer(a.id)}>×</Button>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between border-t pt-3">
          <span className="text-muted-foreground">Total</span>
          <span className="text-2xl font-semibold tabular-nums" data-testid="panier-total" data-valeur={total}>{f(total)}</span>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Mode de paiement">
          {ORDRE_MODES.map((m) => (
            <button
              key={m}
              type="button"
              data-mode={m}
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m)
                setPartTxt("")
                setRecu("")
              }}
              className={`rounded-md border px-3 py-2 text-sm ${mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {MODES[m]}
            </button>
          ))}
        </div>

        {mode === "COMPTE" ? (
          <div className="space-y-1">
            <Label htmlFor="ca-identifiant">Badge ou matricule</Label>
            <Input
              id="ca-identifiant"
              ref={champ}
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  valider()
                }
              }}
              autoComplete="off"
              autoFocus
              placeholder="Scannez le badge ou le bracelet"
            />
            <ScanCamera surCode={(v) => { setIdentifiant(v); jouer("ajout") }} />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ca-visiteur">Nom du client (facultatif)</Label>
              <Input id="ca-visiteur" value={visiteur} onChange={(e) => setVisiteur(e.target.value)} maxLength={60} autoComplete="off" />
            </div>
            {mode === "CASH" ? (
              <div className="space-y-1">
                <Label htmlFor="ca-recu">Montant reçu (facultatif)</Label>
                <Input id="ca-recu" value={recu} onChange={(e) => setRecu(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="Espèces remises par le client" />
                {renduAffiche !== null ? <p data-testid="rendu-apercu" data-valeur={renduAffiche} className="text-sm text-muted-foreground">Monnaie à rendre : {f(renduAffiche)}</p> : null}
              </div>
            ) : null}
          </div>
        )}

        {mode !== "COMPTE" ? (
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <div className="space-y-1">
              <Label htmlFor="ca-part">Part payée sur compte prépayé (paiement mixte)</Label>
              <Input id="ca-part" value={partTxt} onChange={(e) => setPartTxt(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="0" />
            </div>
            {part > 0 ? (
              <div className="space-y-1">
                <Label htmlFor="ca-identifiant-mixte">Badge ou matricule</Label>
                <Input id="ca-identifiant-mixte" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} autoComplete="off" placeholder="Scannez le badge ou le bracelet" />
                <ScanCamera surCode={(v) => { setIdentifiant(v); jouer("ajout") }} />
                <p data-testid="reste-apercu" data-valeur={aRegler} className="text-sm text-muted-foreground">Reste à régler en {MODES[mode]} : {f(aRegler)}</p>
              </div>
            ) : null}
          </div>
        ) : null}
        {peutRemise ? (
          <div className="space-y-1">
            <Label htmlFor="ca-remise">Remise (%)</Label>
            <Input id="ca-remise" value={remise} onChange={(e) => setRemise(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="0" />
            {montantRemise > 0 ? <p data-testid="remise-apercu" data-valeur={montantRemise} className="text-sm text-muted-foreground">Remise : −{f(montantRemise)}</p> : null}
          </div>
        ) : null}
        <Button type="button" className="h-12 w-full text-base" disabled={attente || lignes.length === 0} onClick={valider}>
          Encaisser
        </Button>
        {erreur ? <p role="alert" data-testid="caisse-erreur" className="text-sm text-destructive">{erreur}</p> : null}
        {info ? <p role="status" data-testid="caisse-hors-ligne-ok" className="text-sm text-amber-700">{info}</p> : null}
        {resultat ? (
          <p role="status" data-testid="caisse-resultat" data-numero={resultat.numero} data-total={resultat.total} data-solde={resultat.solde ?? ""} className="text-sm text-emerald-600">
            Vente {numeroTicket(resultat.numero)} encaissée : {f(resultat.total)}.{resultat.solde !== null ? " Solde restant : " + f(resultat.solde) + "." : ""}
          </p>
        ) : null}
        {ticket ? <RecuImprimante key={ticket.libelle} ticket={ticket} onNouvelle={() => { setTicket(null); setResultat(null) }} /> : null}
      </aside>
    </div>
  )
}