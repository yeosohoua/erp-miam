import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { EtablissementsView } from "./etablissements-view"

export const metadata: Metadata = { title: "Établissements" }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <EtablissementsView />
    </Suspense>
  )
}