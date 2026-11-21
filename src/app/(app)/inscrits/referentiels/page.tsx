import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { ReferentielsView } from "./referentiels-view"

export const metadata: Metadata = { title: "Référentiels" }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ReferentielsView />
    </Suspense>
  )
}