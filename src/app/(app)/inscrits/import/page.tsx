import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { ImportView } from "./import-view"

export const metadata: Metadata = { title: "Import des inscrits" }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ImportView />
    </Suspense>
  )
}