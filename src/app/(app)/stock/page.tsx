import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { StockView } from "./stock-view"

export const metadata: Metadata = { title: "Stock" }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <StockView />
    </Suspense>
  )
}