import { useMemo } from 'react'
import { useScenarioStore } from '@/store/scenarioStore'
import type { ResidentialZone } from '@/types/geography'
import type { ZoneImpact } from '@/types/simulation'

const GROUPS = 5
const LABELS = ['Lowest', 'Lower', 'Middle', 'Upper', 'Highest']
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

interface Group {
  label: string
  maxIncome: number
  avgMinutes: number
  shareAffected: number
}

function weightedMedian(rows: { value: number; weight: number }[]): number | null {
  const sorted = rows.filter((row) => row.weight > 0).sort((a, b) => a.value - b.value)
  const total = sorted.reduce((sum, row) => sum + row.weight, 0)
  let running = 0
  for (const row of sorted) {
    running += row.weight
    if (running >= total / 2) return row.value
  }
  return null
}

function analyze(zones: ResidentialZone[], impacts: ZoneImpact[]) {
  const minutesByZone = new Map(impacts.map((impact) => [impact.zoneId, impact.delayMinutes]))
  const rows = zones
    .filter((zone) => zone.medianIncome != null && zone.population > 0)
    .map((zone) => ({
      income: zone.medianIncome as number,
      population: zone.population,
      minutes: Math.max(0, minutesByZone.get(zone.id) ?? 0),
    }))
    .sort((a, b) => a.income - b.income)
  const total = rows.reduce((sum, row) => sum + row.population, 0)
  if (total === 0) return null

  const buckets = Array.from({ length: GROUPS }, () => ({ population: 0, personMinutes: 0, affected: 0, maxIncome: 0 }))
  let running = 0
  for (const row of rows) {
    const index = Math.min(GROUPS - 1, Math.floor((running / total) * GROUPS))
    const bucket = buckets[index]
    bucket.population += row.population
    bucket.personMinutes += row.minutes * row.population
    if (row.minutes > 0) bucket.affected += row.population
    bucket.maxIncome = row.income
    running += row.population
  }

  const groups: Group[] = buckets.map((bucket, i) => ({
    label: LABELS[i],
    maxIncome: bucket.maxIncome,
    avgMinutes: bucket.population ? bucket.personMinutes / bucket.population : 0,
    shareAffected: bucket.population ? bucket.affected / bucket.population : 0,
  }))

  return {
    groups,
    affectedMedian: weightedMedian(
      rows.filter((row) => row.minutes > 0).map((row) => ({ value: row.income, weight: row.population })),
    ),
    overallMedian: weightedMedian(rows.map((row) => ({ value: row.income, weight: row.population }))),
    coverage: rows.length / Math.max(1, zones.length),
  }
}

export function IncomeEquity({ impacts, gain }: { impacts: ZoneImpact[]; gain: boolean }) {
  const zones = useScenarioStore((state) => state.zones)
  const analysis = useMemo(() => analyze(zones, impacts), [zones, impacts])
  if (!analysis) return null

  const { groups, affectedMedian, overallMedian, coverage } = analysis
  const max = Math.max(0.1, ...groups.map((group) => group.avgMinutes))
  const low = groups[0].avgMinutes
  const high = groups[GROUPS - 1].avgMinutes
  const ratio = high > 0.05 ? low / high : null
  const barClass = gain ? 'bg-emerald-400' : 'bg-impact-2'

  let headline: string
  if (ratio != null && ratio >= 1.15) {
    headline = `The lowest-income fifth ${gain ? 'gains' : 'loses'} ${ratio.toFixed(1)}× as much time per resident as the highest.`
  } else if (ratio != null && ratio <= 0.87) {
    headline = `The highest-income fifth ${gain ? 'gains' : 'loses'} ${(1 / ratio).toFixed(1)}× as much time per resident as the lowest.`
  } else if (ratio == null && low > 0.05) {
    headline = `Only lower-income areas are ${gain ? 'helped' : 'hit'}; the highest-income fifth is unaffected.`
  } else {
    headline = `The ${gain ? 'benefit' : 'burden'} is spread fairly evenly across income levels.`
  }

  return (
    <div>
      <h3 className="mb-1 px-1 text-sm font-semibold text-fog-100">
        {gain ? 'Who benefits, by income' : 'Who bears it, by income'}
      </h3>
      <p className="mb-3 px-1 text-[12px] leading-relaxed text-fog-400">{headline}</p>

      <div className="space-y-2 px-1">
        {groups.map((group) => (
          <div key={group.label} className="grid grid-cols-[72px_1fr_64px] items-center gap-2">
            <div className="leading-tight">
              <div className="text-[12px] text-fog-100">{group.label}</div>
              <div className="font-mono text-[10px] text-fog-500">≤ {money.format(group.maxIncome)}</div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className={`h-full rounded-full ${barClass} transition-[width] duration-500`}
                style={{ width: `${(group.avgMinutes / max) * 100}%` }}
              />
            </div>
            <div className="text-right font-mono text-[11px] tabular-nums text-fog-300">
              {gain ? '−' : '+'}
              {group.avgMinutes.toFixed(1)} min
              <div className="text-[9.5px] text-fog-500">{Math.round(group.shareAffected * 100)}% {gain ? 'helped' : 'hit'}</div>
            </div>
          </div>
        ))}
      </div>

      {affectedMedian != null && overallMedian != null && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/[0.03] px-3 py-2 ring-1 ring-white/5">
            <div className="eyebrow">{gain ? 'Median income, helped' : 'Median income, affected'}</div>
            <div className="mt-1 font-mono text-sm text-fog-100">{money.format(affectedMedian)}</div>
          </div>
          <div className="rounded-xl bg-white/[0.03] px-3 py-2 ring-1 ring-white/5">
            <div className="eyebrow">Median income, all</div>
            <div className="mt-1 font-mono text-sm text-fog-100">{money.format(overallMedian)}</div>
          </div>
        </div>
      )}
      <p className="mt-2 px-1 text-[10.5px] text-fog-500">
        Five equal-population groups by block-group median household income. Averages include
        unaffected residents. {Math.round(coverage * 100)}% of block groups have income data.
      </p>
    </div>
  )
}
