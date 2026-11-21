import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { PersonnelView } from "./personnel-view"

export const metadata: Metadata = { title: "Congés et présences" }

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <PersonnelView searchParams={searchParams} />
    </Suspense>
  )
}