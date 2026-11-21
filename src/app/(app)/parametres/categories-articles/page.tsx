import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { CategoriesView } from "./categories-view"

export const metadata: Metadata = { title: "Catégories d'articles" }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <CategoriesView />
    </Suspense>
  )
}