import Link from "next/link"
import { redirect } from "next/navigation"
import QRCode from "qrcode"

import { db } from "@/lib/db"
import { accesInscrits } from "@/lib/inscrits-acces"

import { BoutonImprimer } from "./imprimer"

const PAR_PAGE = 120

export async function BadgesView({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const acces = await accesInscrits()
  if (!acces || !acces.ecriture) redirect("/")
  const { etab } = acces
  if (!etab) redirect("/inscrits")

  const sp = await searchParams
  const premier = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""
  const groupes = await db.referentiel.findMany({ where: { etablissementId: etab.id, kind: "GROUPE" }, orderBy: { name: "asc" }, select: { id: true, name: true } })
  const groupeId = groupes.find((g) => g.id === premier(sp.groupe))?.id
  const page = Math.max(1, Number.parseInt(premier(sp.page), 10) || 1)
  const where = { etablissementId: etab.id, statut: "ACTIVE" as const, ...(groupeId ? { groupeId } : {}) }

  const [total, inscrits] = await Promise.all([
    db.inscrit.count({ where }),
    db.inscrit.findMany({ where, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], skip: (page - 1) * PAR_PAGE, take: PAR_PAGE, include: { groupe: true } }),
  ])
  const cartes = await Promise.all(inscrits.map(async (i) => ({ i, qr: await QRCode.toDataURL(i.badge, { margin: 1, width: 240, errorCorrectionLevel: "M" }) })))
  const lien = (g: string | undefined, p: number) => "/inscrits/badges?" + (g ? "groupe=" + g + "&" : "") + "page=" + p
  const pages = Math.max(1, Math.ceil(total / PAR_PAGE))

  return (
    <div className="flex flex-col gap-6" data-testid="planche-badges">
      <style>{`@media print { header, [data-slot="sidebar"], [data-slot="sidebar-gap"], [data-slot="sidebar-container"], .no-print { display: none !important } }`}</style>
      <div className="no-print flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Badges QR</h2>
          <p className="text-sm text-muted-foreground">
            {total} inscrit(s) actif(s) — {etab.name}. Le QR contient le code du badge, à scanner dans le module Service.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href={lien(undefined, 1)} className={"rounded-md border px-3 py-1 " + (!groupeId ? "bg-muted font-medium" : "")}>
            Tous
          </Link>
          {groupes.map((g) => (
            <Link key={g.id} href={lien(g.id, 1)} className={"rounded-md border px-3 py-1 " + (g.id === groupeId ? "bg-muted font-medium" : "")}>
              {g.name}
            </Link>
          ))}
          <BoutonImprimer />
        </div>
        {pages > 1 ? (
          <div className="flex items-center gap-4 text-sm">
            {page > 1 ? <Link href={lien(groupeId, page - 1)}>← Précédent</Link> : null}
            <span>
              Page {page} / {pages}
            </span>
            {page < pages ? <Link href={lien(groupeId, page + 1)}>Suivant →</Link> : null}
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 print:grid-cols-3">
        {cartes.map(({ i, qr }) => (
          <div key={i.id} data-badge={i.matricule} className="flex break-inside-avoid flex-col items-center gap-1 rounded-lg border p-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img data-qr src={qr} alt={"QR " + i.matricule} width={160} height={160} />
            <p className="text-sm font-semibold">
              {i.lastName} {i.firstName}
            </p>
            <p className="text-xs text-muted-foreground">
              {i.matricule}
              {i.groupe ? " · " + i.groupe.name : ""}
            </p>
            <p className="text-[10px] text-muted-foreground">{etab.name}</p>
          </div>
        ))}
      </div>
    </div>
  )
}