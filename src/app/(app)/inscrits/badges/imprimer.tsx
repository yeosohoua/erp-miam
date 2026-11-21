"use client"

import { Button } from "@/components/ui/button"

export function BoutonImprimer() {
  return (
    <Button type="button" onClick={() => window.print()}>
      Imprimer la planche
    </Button>
  )
}