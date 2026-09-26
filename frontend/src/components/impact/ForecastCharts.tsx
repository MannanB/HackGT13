import { useMemo, type ReactNode } from 'react'
import { buildForecast, type HospitalForecast, type RankedBar } from '@/services/forecast'
import { useScenarioStore } from '@/store/scenarioStore'
import { formatCompact } from '@/utils/constants'

const WIDTH = 300
const HEIGHT = 108
const PLOT_BOTTOM = 14

export function ForecastCharts() {
  const result = useScenarioStore((state) => state.result)
  const disruptionResult = useScenarioStore((state) => state.disruptionResult)
  const gain = useScenarioStore((state) => state.appMode === 'add')
  const startMinute = useScenarioStore((state) => state.failureStartMinute)
  const elapsedMinutes = useScenarioStore((state) => state.failureElapsedMinutes)
  const nowMinute = useScenarioStore((state) => state.timeMinute)
  const closure = gain ? disruptionResult : result
  const addition = gain ? result : null

  const forecast = useMemo(() => {
    if (!closure) return null
    return buildForecast({ closure, addition, startMinute, elapsedMinutes, nowMinute })
  }, [closure, addition, startMinute, elapsedMinutes, nowMinute])

  if (!forecast || forecast.points.every((point) => point.arrivals <= 0)) return null

  return (
    <section className="space-y-4">
      <div className="px-1">
        <h3 className="text-sm font-semibold text-fog-100">24-hour forecast</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-fog-400">
          How full the hospitals get, which communities stay delayed, and where the closure travels.
        </p>
      </div>
      <OverflowSequence hospitals={forecast.hospitals} />
      <BarRank
        title={forecast.overflowMeasuresLoad ? 'How full at 24h' : 'Overflow at 24h'}
        unit={forecast.overflowMeasuresLoad ? 'full' : 'patients'}
        items={forecast.overflowRank}
        tone="red"
        formatValue={forecast.overflowMeasuresLoad ? (value) => `${Math.round(value * 100)}%` : undefined}
      />
      <BarRank title="Communities still delayed at 24h" unit="person-min" items={forecast.communityRank} tone="gold" />
      <Cascade stages={forecast.cascade} />
      <BuildCompare
        closurePersonMinutes={forecast.closurePersonMinutes}
        withSitesPersonMinutes={forecast.withSitesPersonMinutes}
      />
    </section>
  )
}

function ChartFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <h4 className="text-[12px] font-medium text-fog-200">{title}</h4>
      </div>
      {children}
    </div>
  )
}

function coords(values: number[], max: number, min = 0) {
  const span = Math.max(max - min, 1e-9)
  const plotHeight = HEIGHT - PLOT_BOTTOM
  return values.map((value, index) => {
    const x = values.length === 1 ? WIDTH / 2 : (index / (values.length - 1)) * WIDTH
    const y = plotHeight - ((value - min) / span) * (plotHeight - 6) - 2
    return [x, y] as const
  })
}

function stepPath(points: readonly (readonly [number, number])[]) {
  if (points.length === 0) return ''
  let path = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`
  for (let index = 1; index < points.length; index += 1) {
    path += ` H${points[index][0].toFixed(1)} V${points[index][1].toFixed(1)}`
  }
  return path
}

function OverflowSequence({ hospitals }: { hospitals: HospitalForecast[] }) {
  const ordered = hospitals
    .filter((hospital) => hospital.fullAtHour != null)
    .sort((a, b) => (a.fullAtHour ?? 99) - (b.fullAtHour ?? 99))
  const steps = Array.from({ length: 25 }, (_, hour) => ordered.filter((hospital) => (hospital.fullAtHour ?? 99) <= hour).length)
  const max = Math.max(1, ordered.length)
  return (
    <ChartFrame title="Order hospitals fill">
      {ordered.length === 0 ? (
        <p className="px-1 text-[12px] text-fog-400">None of the tracked hospitals cross capacity in 24 hours.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="How many hospitals are full">
            <path d={stepPath(coords(steps, max))} fill="none" stroke="#ff7a6e" strokeWidth="1.6" />
            <HourTicks />
          </svg>
          <ol className="mt-1 space-y-0.5 px-1">
            {ordered.map((hospital, index) => (
              <li key={hospital.poiId} className="flex justify-between gap-2 text-[10px] text-fog-400">
                <span className="truncate">{index + 1}. {hospital.name}</span>
                <span className="shrink-0 font-mono tabular-nums">{hospital.fullAtHour}h</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </ChartFrame>
  )
}

function BarRank({
  title,
  unit,
  items,
  tone,
  formatValue,
}: {
  title: string
  unit: string
  items: RankedBar[]
  tone: 'red' | 'gold'
  formatValue?: (value: number) => string
}) {
  if (items.length === 0) return null
  const max = Math.max(...items.map((item) => item.value), 1)
  const color = tone === 'red' ? '#ff7a6e' : '#f5be46'
  return (
    <ChartFrame title={title}>
      <ul className="space-y-1.5 px-1">
        {items.map((item) => (
          <li key={item.id}>
            <div className="mb-0.5 flex justify-between gap-2 text-[10px] text-fog-300">
              <span className="truncate">{item.name}</span>
              <span className="shrink-0 font-mono tabular-nums text-fog-400">
                {formatValue ? formatValue(item.value) : `${formatCompact(item.value)} ${unit}`}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full" style={{ width: `${(item.value / max) * 100}%`, background: color }} />
            </div>
          </li>
        ))}
      </ul>
    </ChartFrame>
  )
}

function Cascade({ stages }: { stages: { id: string; label: string; items: RankedBar[] }[] }) {
  if (stages.length === 0) return null
  return (
    <ChartFrame title="Where the closure travels">
      <ol className="space-y-2 px-1">
        {stages.map((stage, index) => (
          <li key={stage.id}>
            <div className="mb-1 text-[10px] tracking-wide text-fog-500 uppercase">{index + 1}. {stage.label}</div>
            <div className="flex flex-wrap gap-1">
              {stage.items.map((item) => (
                <span key={item.id} className="max-w-full truncate rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-fog-200">
                  {item.name}
                  <span className="ml-1 font-mono text-fog-400">{formatCompact(item.value)}</span>
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </ChartFrame>
  )
}

function BuildCompare({
  closurePersonMinutes,
  withSitesPersonMinutes,
}: {
  closurePersonMinutes: number
  withSitesPersonMinutes: number | null
}) {
  const rows = [
    { label: 'Closure only', value: closurePersonMinutes, color: '#ff7a6e' },
    ...(withSitesPersonMinutes == null
      ? []
      : [{ label: 'With new sites', value: withSitesPersonMinutes, color: '#34c778' }]),
  ]
  const max = Math.max(...rows.map((row) => row.value), 1)
  return (
    <ChartFrame title="Closure versus a new site">
      <ul className="space-y-2 px-1">
        {rows.map((row) => (
          <li key={row.label}>
            <div className="mb-0.5 flex justify-between gap-2 text-[10px] text-fog-300">
              <span>{row.label}</span>
              <span className="font-mono tabular-nums">{formatCompact(row.value)} person-min</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full" style={{ width: `${(row.value / max) * 100}%`, background: row.color }} />
            </div>
          </li>
        ))}
      </ul>
      {withSitesPersonMinutes == null && (
        <p className="mt-1 px-1 text-[10px] text-fog-500">Switch to Plan and place a facility to draw the second bar from this closure.</p>
      )}
    </ChartFrame>
  )
}

function HourTicks() {
  const marks = [0, 6, 12, 18, 24]
  return (
    <g>
      {marks.map((hour) => (
        <text
          key={hour}
          x={(hour / 24) * WIDTH}
          y={HEIGHT - 1}
          textAnchor={hour === 0 ? 'start' : hour === 24 ? 'end' : 'middle'}
          fill="#6b7280"
          fontSize="8"
        >
          {hour}h
        </text>
      ))}
    </g>
  )
}

