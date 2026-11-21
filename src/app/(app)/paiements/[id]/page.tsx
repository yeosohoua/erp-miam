import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { FicheView } from "./fiche-view"

export const metadata: Metadata = { title: "Compte prépayé" }

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <FicheView params={params} />
    </Suspense>
  )
}