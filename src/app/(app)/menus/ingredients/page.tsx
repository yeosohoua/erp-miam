import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { IngredientsView } from "./ingredients-view"

export const metadata: Metadata = { title: "Ingrédients" }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <IngredientsView />
    </Suspense>
  )
}