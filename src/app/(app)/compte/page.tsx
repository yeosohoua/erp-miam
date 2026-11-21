import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { CompteView } from "./compte-view"

export const metadata: Metadata = { title: "Mon compte" }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <CompteView />
    </Suspense>
  )
}