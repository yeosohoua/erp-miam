import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { EtablissementDetail } from "./etablissement-detail"

export const metadata: Metadata = { title: "Établissement" }

async function Contenu({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <EtablissementDetail id={id} />
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Contenu params={params} />
    </Suspense>
  )
}