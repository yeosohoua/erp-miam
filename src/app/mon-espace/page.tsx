import { UtensilsCrossed } from "lucide-react"
import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { NOM_APP } from "@/lib/marque"

import { MonEspaceView } from "./mon-espace-view"

export const metadata: Metadata = { title: "Mon espace" }

export default function Page() {
  return (
    <main className="flex min-h-svh items-start justify-center p-4 md:items-center">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex items-center justify-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <UtensilsCrossed className="size-5" />
          </div>
          <span className="text-lg font-semibold">{NOM_APP}</span>
        </div>
        <Suspense fallback={<Skeleton className="h-72 w-full" />}>
          <MonEspaceView />
        </Suspense>
      </div>
    </main>
  )
}