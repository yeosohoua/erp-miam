"use client"

import { Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { rechercherPalette, type ResultatRecherche } from "@/components/palette-actions"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

export type PagePalette = { title: string; url: string; description: string }
type Entree = { cle: string; groupe: string; titre: string; detail: string; url: string }

const norm = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

export function Palette({ pages, recherche }: { pages: PagePalette[]; recherche: boolean }) {
  const router = useRouter()
  const [ouvert, setOuvert] = useState(false)
  const [q, setQ] = useState("")
  const [serveur, setServeur] = useState<ResultatRecherche[]>([])
  const [actif, setActif] = useState(0)

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOuvert((o) => !o)
      }
    }
    window.addEventListener("keydown", touche)
    return () => window.removeEventListener("keydown", touche)
  }, [])

  useEffect(() => {
    if (!recherche || q.trim().length < 2) {
      setServeur([])
      return
    }
    let annule = false
    const t = setTimeout(() => {
      rechercherPalette(q)
        .then((r) => { if (!annule) setServeur(r) })
        .catch(() => { if (!annule) setServeur([]) })
    }, 200)
    return () => { annule = true; clearTimeout(t) }
  }, [q, recherche])

  const liste: Entree[] = useMemo(() => {
    const n = norm(q.trim())
    const p = pages
      .filter((x) => n === "" || norm(x.title).includes(n) || norm(x.description).includes(n))
      .map((x) => ({ cle: "page" + x.url, groupe: "Pages", titre: x.title, detail: x.description, url: x.url }))
    return [...p, ...serveur]
  }, [q, pages, serveur])

  useEffect(() => { setActif(0) }, [liste.length, q])

  const changer = (o: boolean) => {
    setOuvert(o)
    if (!o) { setQ(""); setServeur([]) }
  }
  const aller = (e: Entree | undefined) => {
    if (!e) return
    changer(false)
    router.push(e.url)
  }

  return (
    <>
      <button type="button" data-testid="palette-bouton" onClick={() => setOuvert(true)} className="inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs text-muted-foreground hover:bg-muted">
        <Search className="size-3.5" />
        <span className="hidden sm:inline">Rechercher…</span>
        <kbd className="hidden rounded border px-1 text-[10px] sm:inline">Ctrl K</kbd>
      </button>
      <Dialog open={ouvert} onOpenChange={changer}>
        <DialogContent className="gap-0 p-0 sm:max-w-xl" data-testid="palette">
          <DialogTitle className="sr-only">Recherche rapide</DialogTitle>
          <DialogDescription className="sr-only">Accédez à une page ou retrouvez un inscrit, un plat, un ingrédient ou un fournisseur.</DialogDescription>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              autoFocus
              data-testid="palette-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActif((a) => Math.min(a + 1, Math.max(0, liste.length - 1))) }
                else if (e.key === "ArrowUp") { e.preventDefault(); setActif((a) => Math.max(a - 1, 0)) }
                else if (e.key === "Enter") { e.preventDefault(); aller(liste[actif]) }
              }}
              maxLength={60}
              placeholder={recherche ? "Page, inscrit, plat, ingrédient, fournisseur…" : "Aller à une page…"}
              className="h-12 w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-1" role="listbox">
            {liste.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground" data-testid="palette-vide">Aucun résultat.</p> : null}
            {liste.map((e, i) => (
              <div key={e.cle}>
                {i === 0 || liste[i - 1].groupe !== e.groupe ? <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase text-muted-foreground">{e.groupe}</p> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === actif}
                  data-testid="palette-resultat"
                  data-groupe={e.groupe}
                  data-url={e.url}
                  onMouseEnter={() => setActif(i)}
                  onClick={() => aller(e)}
                  className={`flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm ${i === actif ? "bg-muted" : ""}`}
                >
                  <span className="truncate font-medium">{e.titre}</span>
                  <span className="truncate text-xs text-muted-foreground">{e.detail}</span>
                </button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}