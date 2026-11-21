import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { AchatsView } from "./achats-view"

export const metadata: Metadata = { title: "Achats" }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <AchatsView />
    </Suspense>
  )
}