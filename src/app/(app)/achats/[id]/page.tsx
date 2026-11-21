import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { BonView } from "./bon-view"

export const metadata: Metadata = { title: "Bon de commande" }

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <BonView params={params} />
    </Suspense>
  )
}