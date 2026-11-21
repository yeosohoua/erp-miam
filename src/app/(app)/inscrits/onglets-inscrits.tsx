import Link from "next/link"

export function OngletsInscrits({ ecriture }: { ecriture: boolean }) {
  return (
    <nav aria-label="Sections des inscrits" className="flex gap-4 border-b pb-2 text-sm">
      <Link href="/inscrits" className="font-medium hover:underline">
        Inscrits
      </Link>
      {ecriture ? (
        <>
          <Link href="/inscrits/referentiels" className="font-medium hover:underline">
            Référentiels
          </Link>
          <Link href="/inscrits/import" className="font-medium hover:underline">
            Import
          </Link>
          <Link href="/inscrits/codes" className="font-medium hover:underline">
            Codes d'accès
          </Link>
        </>
      ) : null}
    </nav>
  )
}