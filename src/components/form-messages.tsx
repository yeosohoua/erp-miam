import type { EtatAction } from "@/lib/etat-action"

export const classeSelect = "h-9 w-full rounded-md border bg-transparent px-3 text-sm"

export function Messages({ etat }: { etat: EtatAction }) {
  return (
    <>
      {etat?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {etat.error}
        </p>
      ) : null}
      {etat?.ok ? (
        <p role="status" className="text-sm text-muted-foreground">
          {etat.ok}
        </p>
      ) : null}
    </>
  )
}