"use client"

export function BoutonImprimer({ libelle = "Imprimer" }: { libelle?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="h-9 rounded-md border px-4 text-sm print:hidden">
      {libelle}
    </button>
  )
}