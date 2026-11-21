import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { CodesView } from "./codes-view"

export const metadata: Metadata = { title: "Codes d'accès" }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <CodesView />
    </Suspense>
  )
}