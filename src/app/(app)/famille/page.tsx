import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { FamilleView } from "./famille-view"

export const metadata: Metadata = { title: "Mes enfants" }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <FamilleView />
    </Suspense>
  )
}