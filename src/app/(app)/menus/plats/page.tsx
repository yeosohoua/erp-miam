import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { PlatsView } from "./plats-view"

export const metadata: Metadata = { title: "Plats" }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <PlatsView />
    </Suspense>
  )
}