import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { ReservationsView } from "./reservations-view"

export const metadata: Metadata = { title: "Réservations" }

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ReservationsView searchParams={searchParams} />
    </Suspense>
  )
}