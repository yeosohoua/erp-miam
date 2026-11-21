import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { SauvegardesView } from "./sauvegardes-view"

export const metadata: Metadata = { title: "Sauvegardes" }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <SauvegardesView />
    </Suspense>
  )
}