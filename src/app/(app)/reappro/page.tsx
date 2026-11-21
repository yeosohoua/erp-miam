import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { ReapproView } from "./reappro-view"

export const metadata: Metadata = { title: "Réapprovisionnement" }

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ReapproView searchParams={searchParams} />
    </Suspense>
  )
}