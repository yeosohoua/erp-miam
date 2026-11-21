import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { InscritsView } from "./inscrits-view"

export const metadata: Metadata = { title: "Inscrits" }

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <InscritsView searchParams={searchParams} />
    </Suspense>
  )
}