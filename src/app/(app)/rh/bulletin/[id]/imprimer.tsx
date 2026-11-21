"use client"

import { Button } from "@/components/ui/button"

export function BoutonImprimer() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()} data-testid="btn-imprimer">
      Imprimer
    </Button>
  )
}