"use client"

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Label, Pie, PieChart, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

const COULEURS_SERVICE: Record<string, string> = { BREAKFAST: "var(--chart-1)", LUNCH: "var(--chart-2)", SNACK: "var(--chart-3)", DINNER: "var(--chart-4)" }

export function GraphiqueFrequentation({ data }: { data: { label: string; reserves: number; servis: number }[] }) {
  const config = { reserves: { label: "Réservés", color: "var(--chart-2)" }, servis: { label: "Servis", color: "var(--chart-1)" } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="h-72 w-full">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="remplissageReserves" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-reserves)" stopOpacity={0.4} />
            <stop offset="95%" stopColor="var(--color-reserves)" stopOpacity={0.03} />
          </linearGradient>
          <linearGradient id="remplissageServis" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-servis)" stopOpacity={0.55} />
            <stop offset="95%" stopColor="var(--color-servis)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
        <Area dataKey="reserves" type="monotone" fill="url(#remplissageReserves)" stroke="var(--color-reserves)" strokeWidth={2} />
        <Area dataKey="servis" type="monotone" fill="url(#remplissageServis)" stroke="var(--color-servis)" strokeWidth={2} />
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  )
}

export function GraphiqueServices({ data, total }: { data: { service: string; label: string; value: number }[]; total: number }) {
  const config: ChartConfig = Object.fromEntries(data.map((d) => [d.service, { label: d.label, color: COULEURS_SERVICE[d.service] }]))
  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-64">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="service" />} />
        <Pie data={data} dataKey="value" nameKey="service" innerRadius={64} strokeWidth={4}>
          {data.map((d) => (
            <Cell key={d.service} fill={COULEURS_SERVICE[d.service]} />
          ))}
          <Label
            content={({ viewBox }) => {
              if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-3xl font-bold">
                      {total}
                    </tspan>
                    <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 24} className="fill-muted-foreground text-xs">
                      repas servis
                    </tspan>
                  </text>
                )
              }
              return null
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}

// Barres groupees en degrade bleu : reserves (clair) contre servis (soutenu), par service.
export function GraphiquePerformance({ data }: { data: { label: string; reserves: number; servis: number }[] }) {
  const config = { reserves: { label: "Réservés", color: "#60a5fa" }, servis: { label: "Servis", color: "#2563eb" } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="h-72 w-full">
      <BarChart data={data} barGap={6} margin={{ left: 4, right: 4, top: 8 }}>
        <defs>
          <linearGradient id="degradeReserves" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#bfdbfe" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
          <linearGradient id="degradeServis" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeOpacity={0.4} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} />
        <YAxis hide allowDecimals={false} />
        <ChartTooltip cursor={{ fillOpacity: 0.06 }} content={<ChartTooltipContent indicator="dot" />} />
        <Bar dataKey="reserves" fill="url(#degradeReserves)" radius={[8, 8, 0, 0]} maxBarSize={44} />
        <Bar dataKey="servis" fill="url(#degradeServis)" radius={[8, 8, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ChartContainer>
  )
}

// Barres empilees par jour : servis, annulees, absents, a venir.
export function GraphiqueReservations({ data }: { data: { label: string; servis: number; annulees: number; absents: number; avenir: number }[] }) {
  const config = {
    servis: { label: "Servis", color: "#26a77a" },
    annulees: { label: "Annulées", color: "#e8a336" },
    absents: { label: "Absents", color: "#e55b5b" },
    avenir: { label: "À venir", color: "#6b7280" },
  } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="h-80 w-full">
      <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.5} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={18} />
        <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
        <ChartTooltip cursor={{ fillOpacity: 0.06 }} content={<ChartTooltipContent indicator="dot" />} />
        <Bar dataKey="servis" stackId="issue" fill="var(--color-servis)" maxBarSize={22} />
        <Bar dataKey="annulees" stackId="issue" fill="var(--color-annulees)" maxBarSize={22} />
        <Bar dataKey="absents" stackId="issue" fill="var(--color-absents)" maxBarSize={22} />
        <Bar dataKey="avenir" stackId="issue" fill="var(--color-avenir)" maxBarSize={22} radius={[3, 3, 0, 0]} />
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  )
}