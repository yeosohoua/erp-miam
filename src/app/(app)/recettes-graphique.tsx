"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

// Recharges encaissees (bleu) contre repas consommes (ambre), par jour.
export function GraphiqueRecettes({ data }: { data: { label: string; recharges: number; consomme: number }[] }) {
  const config = { recharges: { label: "Recharges", color: "#2563eb" }, consomme: { label: "Consommation", color: "#f59e0b" } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="h-72 w-full">
      <BarChart data={data} barGap={6} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.4} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={18} />
        <YAxis tickLine={false} axisLine={false} width={48} allowDecimals={false} />
        <ChartTooltip cursor={{ fillOpacity: 0.06 }} content={<ChartTooltipContent indicator="dot" />} />
        <Bar dataKey="recharges" fill="var(--color-recharges)" radius={[6, 6, 0, 0]} maxBarSize={36} />
        <Bar dataKey="consomme" fill="var(--color-consomme)" radius={[6, 6, 0, 0]} maxBarSize={36} />
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  )
}