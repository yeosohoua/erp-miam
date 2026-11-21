import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { UtilisateursView } from "./utilisateurs-view"

export const metadata: Metadata = { title: "Utilisateurs" }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <UtilisateursView />
    </Suspense>
  )
}