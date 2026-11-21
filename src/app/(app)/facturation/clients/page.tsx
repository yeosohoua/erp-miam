import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { ClientsView } from "./clients-view"

export const metadata: Metadata = { title: "Clients payeurs" }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ClientsView />
    </Suspense>
  )
}