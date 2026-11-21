import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { EnfantView } from "./enfant-view"

export const metadata: Metadata = { title: "Mon enfant" }

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <EnfantView params={params} />
    </Suspense>
  )
}