import "server-only"

import { db } from "@/lib/db"
import { bornesPeriode, libellePeriode } from "@/lib/facturation-base"
import { ORDRE_SERVICES, SERVICES, type ServiceMenu } from "@/lib/menus"

// Un repas servi n'est facture qu'une fois (Reservation.factureId) ; la generation ne prend que les repas
// servis, de la periode, des inscrits rattaches a un client, pour les services dont le tarif est positif.
export async function genererFactures(o: { etabId: string; periode: string; userEmail: string }): Promise<{ erreur: string } | { factures: number; repas: number; total: number }> {
  const etab = await db.etablissement.findUnique({ where: { id: o.etabId }, select: { prepaye: true, tarifs: { select: { service: true, prix: true } } } })
  if (!etab) return { erreur: "Établissement introuvable." }
  if (etab.prepaye) return { erreur: "Le mode prépayé est actif : les repas sont débités des comptes, la facturation mensuelle ne s'applique pas." }
  const prix = new Map<ServiceMenu, number>(etab.tarifs.map((t) => [t.service, t.prix]))
  const payants = ORDRE_SERVICES.filter((s) => (prix.get(s) ?? 0) > 0)
  if (payants.length === 0) return { erreur: "Aucun tarif défini : renseignez les prix dans Paiements." }
  const { debut, fin } = bornesPeriode(o.periode)
  const repas = await db.reservation.findMany({
    where: {
      etablissementId: o.etabId,
      statut: "BOOKED",
      servedAt: { not: null },
      factureId: null,
      date: { gte: debut, lt: fin },
      service: { in: [...payants] },
      inscrit: { clientId: { not: null } },
    },
    select: { id: true, service: true, inscrit: { select: { clientId: true } } },
  })
  if (repas.length === 0) return { erreur: "Aucun repas à facturer pour cette période." }

  const parClient = new Map<string, Map<ServiceMenu, string[]>>()
  for (const r of repas) {
    const c = r.inscrit.clientId as string
    const services = parClient.get(c) ?? new Map<ServiceMenu, string[]>()
    services.set(r.service, [...(services.get(r.service) ?? []), r.id])
    parClient.set(c, services)
  }

  try {
    return await db.$transaction(
      async (tx) => {
        let total = 0
        for (const [clientId, services] of parClient) {
          const lignes: { libelle: string; quantite: number; prixUnitaire: number; montant: number }[] = []
          const ids: string[] = []
          let sous = 0
          for (const s of payants) {
            const liste = services.get(s)
            if (!liste || liste.length === 0) continue
            const pu = prix.get(s) as number
            const montant = pu * liste.length
            lignes.push({ libelle: SERVICES[s] + " — " + libellePeriode(o.periode), quantite: liste.length, prixUnitaire: pu, montant })
            ids.push(...liste)
            sous += montant
          }
          const f = await tx.facture.create({ data: { etablissementId: o.etabId, clientId, periode: o.periode, total: sous, createdBy: o.userEmail, lignes: { create: lignes } } })
          const m = await tx.reservation.updateMany({ where: { id: { in: ids }, factureId: null }, data: { factureId: f.id } })
          if (m.count !== ids.length) throw new Error("CONFLIT")
          total += sous
        }
        return { factures: parClient.size, repas: repas.length, total }
      },
      { timeout: 60_000, maxWait: 10_000 },
    )
  } catch (e) {
    if (e instanceof Error && e.message === "CONFLIT") return { erreur: "Des repas ont été facturés entre-temps. Relancez la génération." }
    console.error("Generation des factures en echec", e)
    return { erreur: "Génération impossible, réessayez." }
  }
}