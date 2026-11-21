import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { AuditView } from "./audit-view"

export const metadata: Metadata = { title: "Journal d'audit" }

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <AuditView searchParams={searchParams} />
    </Suspense>
  )
}