import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { ParametresView } from "./parametres-view"

export const metadata: Metadata = { title: "Paramètres" }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <ParametresView />
    </Suspense>
  )
}