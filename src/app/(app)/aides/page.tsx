import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { AidesView } from "./aides-view"

export const metadata: Metadata = { title: "Aides sociales" }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <AidesView />
    </Suspense>
  )
}