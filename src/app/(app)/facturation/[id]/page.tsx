import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { FactureView } from "./facture-view"

export const metadata: Metadata = { title: "Facture" }

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <FactureView params={params} />
    </Suspense>
  )
}