"use client"

import { Fragment, useId } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Label, Line, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Pie, PieChart, Radar, RadarChart, RadialBar, RadialBarChart, Treemap, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { CaseCalendrier } from "@/lib/analytics-base"

const COULEURS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]
export type Serie = { key: string; label: string; color?: string }
export type Ligne = Record<string, string | number>
const cfg = (series: Serie[]): ChartConfig => Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, color: s.color ?? COULEURS[i % COULEURS.length] }]))
const VIDE = <p className="py-8 text-center text-sm text-muted-foreground">Aucune donnée sur la période.</p>

export function Spark({ data }: { data: number[] }) {
  const config = { v: { label: "Évolution", color: "var(--chart-1)" } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="h-10 w-full">
      <AreaChart data={data.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <Area dataKey="v" type="monotone" stroke="var(--color-v)" fill="var(--color-v)" fillOpacity={0.15} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ChartContainer>
  )
}

export function GraphAire({ data, series, empile = false, hauteur = "h-72" }: { data: Ligne[]; series: Serie[]; empile?: boolean; hauteur?: string }) {
  const id = useId().replace(/:/g, "")
  if (data.length === 0) return VIDE
  return (
    <ChartContainer config={cfg(series)} className={hauteur + " w-full"}>
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${s.key})`} stopOpacity={0.5} />
              <stop offset="95%" stopColor={`var(--color-${s.key})`} stopOpacity={0.04} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} width={44} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
        {series.map((s) => (
          <Area key={s.key} dataKey={s.key} type="monotone" fill={`url(#${id}-${s.key})`} stroke={`var(--color-${s.key})`} strokeWidth={2} stackId={empile ? "a" : undefined} />
        ))}
        {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
      </AreaChart>
    </ChartContainer>
  )
}

export function GraphBarres({ data, series, categorie = "label", empile = false, horizontal = false, hauteur }: { data: Ligne[]; series: Serie[]; categorie?: string; empile?: boolean; horizontal?: boolean; hauteur?: string }) {
  if (data.length === 0) return VIDE
  const h = hauteur ?? (horizontal ? undefined : "h-72")
  return (
    <ChartContainer config={cfg(series)} className={(h ?? "") + " w-full"} style={horizontal ? { height: Math.max(180, data.length * 34) } : undefined}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey={categorie} tickLine={false} axisLine={false} width={120} />
          </>
        ) : (
          <>
            <XAxis dataKey={categorie} tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} width={44} />
          </>
        )}
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} fill={`var(--color-${s.key})`} stackId={empile ? "a" : undefined} radius={empile ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} />
        ))}
        {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
      </BarChart>
    </ChartContainer>
  )
}

// Barres + lignes (axe de gauche) et, au choix, une ligne sur un axe de droite en pourcentage (Pareto).
export function GraphMixte({ data, barres, lignes = [], droite, categorie = "label", hauteur = "h-72" }: { data: Ligne[]; barres: Serie[]; lignes?: Serie[]; droite?: Serie; categorie?: string; hauteur?: string }) {
  if (data.length === 0) return VIDE
  const toutes = [...barres, ...lignes, ...(droite ? [droite] : [])]
  return (
    <ChartContainer config={cfg(toutes)} className={hauteur + " w-full"}>
      <ComposedChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={categorie} tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
        <YAxis yAxisId="g" tickLine={false} axisLine={false} width={44} />
        {droite ? <YAxis yAxisId="d" orientation="right" domain={[0, 100]} tickLine={false} axisLine={false} width={36} /> : null}
        <ChartTooltip content={<ChartTooltipContent />} />
        {barres.map((s) => (
          <Bar key={s.key} yAxisId="g" dataKey={s.key} fill={`var(--color-${s.key})`} radius={[4, 4, 0, 0]} />
        ))}
        {lignes.map((s) => (
          <Line key={s.key} yAxisId="g" dataKey={s.key} type="monotone" stroke={`var(--color-${s.key})`} strokeWidth={2} dot={{ r: 2 }} />
        ))}
        {droite ? <Line yAxisId="d" dataKey={droite.key} type="monotone" stroke={`var(--color-${droite.key})`} strokeWidth={2} dot={{ r: 3 }} /> : null}
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  )
}

export function Donut({ data, centre }: { data: { nom: string; valeur: number }[]; centre?: { valeur: string; libelle: string } }) {
  if (data.length === 0 || data.every((d) => d.valeur === 0)) return VIDE
  const lignes = data.map((d, i) => ({ ...d, cle: "s" + i }))
  const config: ChartConfig = Object.fromEntries(lignes.map((d, i) => [d.cle, { label: d.nom, color: COULEURS[i % COULEURS.length] }]))
  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-60">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="cle" />} />
        <Pie data={lignes} dataKey="valeur" nameKey="cle" innerRadius={62} strokeWidth={4}>
          {lignes.map((d, i) => (
            <Cell key={d.cle} fill={COULEURS[i % COULEURS.length]} />
          ))}
          {centre ? (
            <Label
              content={({ viewBox }) =>
                viewBox && "cx" in viewBox && "cy" in viewBox ? (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-bold">{centre.valeur}</tspan>
                    <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 22} className="fill-muted-foreground text-xs">{centre.libelle}</tspan>
                  </text>
                ) : null
              }
            />
          ) : null}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="cle" />} />
      </PieChart>
    </ChartContainer>
  )
}

export function Jauge({ valeur, objectif, libelle }: { valeur: number | null; objectif?: number; libelle: string }) {
  const v = Math.max(0, Math.min(100, valeur ?? 0))
  const config = { v: { label: libelle, color: objectif === undefined || v >= objectif ? "var(--chart-2)" : "var(--chart-5)" } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-56" data-testid="jauge" data-valeur={valeur ?? ""}>
      <RadialBarChart data={[{ v }]} startAngle={90} endAngle={-270} innerRadius={80} outerRadius={110}>
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
        <RadialBar dataKey="v" background cornerRadius={10} fill="var(--color-v)" />
        <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
          <Label
            content={({ viewBox }) =>
              viewBox && "cx" in viewBox && "cy" in viewBox ? (
                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-3xl font-bold">{valeur === null ? "—" : String(valeur).replace(".", ",") + " %"}</tspan>
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 24} className="fill-muted-foreground text-xs">{libelle}</tspan>
                </text>
              ) : null
            }
          />
        </PolarRadiusAxis>
      </RadialBarChart>
    </ChartContainer>
  )
}

export function RadarComparaison({ lignes }: { lignes: { service: string; presence: number; precision: number; maitrise: number }[] }) {
  if (lignes.length === 0) return VIDE
  const series = lignes.map((l, i) => ({ key: "s" + i, label: l.service }))
  const indicateurs: [string, "presence" | "precision" | "maitrise"][] = [["Présence", "presence"], ["Précision des prévisions", "precision"], ["Maîtrise du gaspillage", "maitrise"]]
  const data = indicateurs.map(([nom, k]) => ({ indicateur: nom, ...Object.fromEntries(lignes.map((l, i) => ["s" + i, l[k]])) }))
  return (
    <ChartContainer config={cfg(series)} className="mx-auto aspect-square h-72">
      <RadarChart data={data}>
        <ChartTooltip content={<ChartTooltipContent />} />
        <PolarGrid />
        <PolarAngleAxis dataKey="indicateur" />
        {series.map((s) => (
          <Radar key={s.key} dataKey={s.key} stroke={`var(--color-${s.key})`} fill={`var(--color-${s.key})`} fillOpacity={0.2} />
        ))}
        <ChartLegend content={<ChartLegendContent />} />
      </RadarChart>
    </ChartContainer>
  )
}

type NoeudProps = { x?: number; y?: number; width?: number; height?: number; index?: number; name?: string }
function Noeud({ x = 0, y = 0, width = 0, height = 0, index = 0, name = "" }: NoeudProps) {
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={COULEURS[index % COULEURS.length]} fillOpacity={0.85} stroke="var(--background)" strokeWidth={2} rx={4} />
      {width > 70 && height > 24 ? <text x={x + 8} y={y + 18} fill="var(--background)" fontSize={12}>{name}</text> : null}
    </g>
  )
}
export function CarteArbre({ data }: { data: { nom: string; valeur: number }[] }) {
  if (data.length === 0) return VIDE
  return (
    <ChartContainer config={{}} className="h-72 w-full">
      <Treemap data={data.map((d) => ({ name: d.nom, size: d.valeur }))} dataKey="size" content={<Noeud />} isAnimationActive={false} />
    </ChartContainer>
  )
}

// Cascade : chaque etape part du cumul precedent ; les etapes "total" repartent de zero.
export function Cascade({ etapes }: { etapes: { nom: string; valeur: number; total: boolean }[] }) {
  let cumul = 0
  const data = etapes.map((e) => {
    if (e.total) {
      cumul = e.valeur
      return { nom: e.nom, base: 0, montant: Math.abs(e.valeur), signe: e.valeur >= 0 ? 1 : -1 }
    }
    const avant = cumul
    cumul += e.valeur
    return { nom: e.nom, base: Math.min(avant, cumul), montant: Math.abs(e.valeur), signe: e.valeur >= 0 ? 1 : -1 }
  })
  const config = { montant: { label: "Montant", color: "var(--chart-2)" } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="h-64 w-full" data-testid="cascade">
      <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="nom" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={56} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="base" stackId="c" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="montant" stackId="c" radius={4}>
          {data.map((d) => (
            <Cell key={d.nom} fill={d.signe >= 0 ? "var(--chart-2)" : "var(--chart-5)"} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

export function Entonnoir({ etapes }: { etapes: { nom: string; valeur: number }[] }) {
  const max = Math.max(1, ...etapes.map((e) => e.valeur))
  return (
    <div className="space-y-2" data-testid="entonnoir">
      {etapes.map((e, i) => (
        <div key={e.nom} data-etape={e.nom} data-valeur={e.valeur}>
          <div className="mb-1 flex justify-between text-sm">
            <span>{e.nom}</span>
            <span className="tabular-nums text-muted-foreground">{e.valeur}</span>
          </div>
          <div className="h-8 rounded-md bg-muted/40">
            <div className="mx-auto h-8 rounded-md" style={{ width: `${Math.max(2, Math.round((e.valeur * 100) / max))}%`, backgroundColor: COULEURS[i % COULEURS.length], opacity: 0.85 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function CarteChaleur({ jours, services, cases, max }: { jours: string[]; services: { service: string; label: string }[]; cases: number[][]; max: number }) {
  return (
    <div className="grid gap-1" data-testid="carte-chaleur" style={{ gridTemplateColumns: `6rem repeat(${services.length}, minmax(0, 1fr))` }}>
      <div />
      {services.map((s) => (
        <div key={s.service} className="text-center text-xs text-muted-foreground">{s.label}</div>
      ))}
      {jours.map((j, ji) => (
        <Fragment key={j}>
          <div className="flex items-center text-xs text-muted-foreground">{j}</div>
          {services.map((s, si) => {
            const v = cases[ji]?.[si] ?? 0
            return (
              <div
                key={s.service}
                data-jour={j}
                data-service={s.service}
                data-valeur={v}
                title={`${j} · ${s.label} : ${v} repas en moyenne`}
                className="rounded-md bg-muted/40 py-2 text-center text-xs tabular-nums"
                style={v > 0 && max > 0 ? { backgroundColor: `color-mix(in oklab, var(--chart-1) ${Math.round(15 + (85 * v) / max)}%, transparent)` } : undefined}
              >
                {v > 0 ? v : ""}
              </div>
            )
          })}
        </Fragment>
      ))}
    </div>
  )
}

const NIVEAUX = [0, 22, 45, 70, 100]
export function CalendrierThermique({ semaines }: { semaines: (CaseCalendrier | null)[][] }) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1" data-testid="calendrier-thermique">
      <div className="flex flex-col gap-1 pr-1 text-[10px] text-muted-foreground">
        {["L", "M", "M", "J", "V", "S", "D"].map((j, i) => (
          <div key={i} className="flex size-4 items-center">{j}</div>
        ))}
      </div>
      {semaines.map((w, i) => (
        <div key={i} className="flex flex-col gap-1">
          {w.map((c, k) =>
            c ? (
              <div
                key={k}
                data-date={c.date}
                data-niveau={c.niveau}
                title={`${c.date} : ${c.valeur} repas`}
                className="size-4 rounded-sm border bg-muted/40"
                style={c.niveau > 0 ? { backgroundColor: `color-mix(in oklab, var(--chart-1) ${NIVEAUX[c.niveau]}%, transparent)` } : undefined}
              />
            ) : (
              <div key={k} className="size-4" />
            ),
          )}
        </div>
      ))}
    </div>
  )
}