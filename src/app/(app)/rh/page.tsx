import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { RhView } from "./rh-view"

export const metadata: Metadata = { title: "RH et paie" }

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <RhView searchParams={searchParams} />
    </Suspense>
  )
}