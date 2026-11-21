"use client"

import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

export type PointPrevision = { label: string; prevu: number | null; bas: number; ecart: number; plan: number | null }
export type PointGaspillage = { nom: string; cout: number }

export function GraphiquePrevision({ data }: { data: PointPrevision[] }) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground">Aucun créneau sur la période.</p>
  return (
    <div className="h-72 w-full" data-testid="graphique-prevision">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Area dataKey="bas" stackId="intervalle" stroke="none" fill="transparent" legendType="none" name="Bas" />
          <Area dataKey="ecart" stackId="intervalle" stroke="none" fill="var(--chart-2)" fillOpacity={0.25} name="Intervalle" />
          <Bar dataKey="plan" name="À produire" fill="var(--chart-3)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Line dataKey="prevu" name="Prévu" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function GraphiqueGaspillagePlats({ data }: { data: PointGaspillage[] }) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground">Aucun gaspillage enregistré sur la période.</p>
  return (
    <div className="w-full" style={{ height: Math.max(180, data.length * 36) }} data-testid="graphique-gaspillage">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="nom" width={130} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="cout" name="Coût" fill="var(--chart-5)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}