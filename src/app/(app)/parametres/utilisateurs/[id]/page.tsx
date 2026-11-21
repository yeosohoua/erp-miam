import type { Metadata } from "next"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import { UtilisateurDetail } from "./utilisateur-detail"

export const metadata: Metadata = { title: "Utilisateur" }

async function Contenu({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <UtilisateurDetail id={id} />
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Contenu params={params} />
    </Suspense>
  )
}