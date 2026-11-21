import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { ServiceView } from "./service-view"

export const metadata: Metadata = { title: "Service" }

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ServiceView searchParams={searchParams} />
    </Suspense>
  )
}