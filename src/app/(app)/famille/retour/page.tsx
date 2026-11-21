import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { RetourView } from "./retour-view"

export const metadata: Metadata = { title: "Paiement" }

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<Skeleton className="h-48 w-full" />}>
      <RetourView searchParams={searchParams} />
    </Suspense>
  )
}