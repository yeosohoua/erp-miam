import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { HaccpView } from "./haccp-view"

export const metadata: Metadata = { title: "Hygiène et traçabilité" }

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <HaccpView searchParams={searchParams} />
    </Suspense>
  )
}