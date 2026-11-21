import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { PilotageView } from "./pilotage-view"

export const metadata: Metadata = { title: "Pilotage" }

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <PilotageView searchParams={searchParams} />
    </Suspense>
  )
}