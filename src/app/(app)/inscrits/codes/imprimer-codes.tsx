"use client"

import { Button } from "@/components/ui/button"

export function ImprimerCodes() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      Imprimer la liste
    </Button>
  )
}