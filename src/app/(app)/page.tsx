import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { DashboardView } from "./dashboard-view"

export const metadata: Metadata = { title: "Tableau de bord" }

export default function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <DashboardView searchParams={searchParams} />
    </Suspense>
  )
}