import { Sprout, TriangleAlert, Wrench } from 'lucide-react'
import { AffectedCommunities } from '@/components/impact/AffectedCommunities'
import { ForecastCharts } from '@/components/impact/ForecastCharts'
import { ImpactSummary } from '@/components/impact/ImpactSummary'
import { IncomeEquity } from '@/components/impact/IncomeEquity'
import { PoiPressureList } from '@/components/impact/PoiPressureList'
import { TraceImpactPanel } from '@/components/trace/TraceImpactPanel'
import { useScenarioStore } from '@/store/scenarioStore'
import type { StationOperatingState } from '@/types/network'
import type { HospitalCapacity } from '@/types/simulation'
import { formatVisitorRate } from '@/utils/constants'
import { formatTime } from '@/utils/hourlyDemand'
import { cn } from '@/utils/cn'

export function ImpactPanel() {
  const result = useScenarioStore((state) => state.result)
  const stations = useScenarioStore((state) => state.stations)
  const stationStates = useScenarioStore((state) => state.stationStates)
  const impactPending = useScenarioStore((state) => state.computing)
  const setSelectedStation = useScenarioStore((state) => state.selectStation)
  const selectedZoneId = useScenarioStore((state) => state.selectedZoneId)
  const error = useScenarioStore((state) => state.simulationError)

  const disrupted = stations
    .flatMap((station) => {
      const operating = stationStates[station.id]
      if (!operating || operating === 'normal') return []
      return [{ station, operating }]
    })
    .sort((a, b) => a.station.name.localeCompare(b.station.name))

  const gain = useScenarioStore((state) => state.appMode === 'add')
  const addedCount = useScenarioStore((state) => state.addedPois.length)
  const disruptionResult = useScenarioStore((state) => state.disruptionResult)
  const hospitalCapacity =
    result?.hospitalCapacity?.length
      ? result.hospitalCapacity
      : (disruptionResult?.hospitalCapacity ?? [])
  const anyShutdown = disrupted.some((item) => item.operating === 'shutdown')

  return (
    <aside className="glass scroll-thin pointer-events-auto flex max-h-full w-[340px] flex-col overflow-y-auto rounded-2xl">
      <div className="space-y-5 p-4">
        {!result && !error && !impactPending && (
          <div className="rounded-2xl border border-dashed border-ink-600 bg-ink-850/60 px-4 py-8 text-center">
            <p className="text-sm leading-relaxed text-fog-300">
              {gain
                ? disruptionResult
                  ? 'Yellow is the current disruption. Add a hospital, grocery or other service and drag it — 15+ minute savings turn green over those delays.'
                  : 'Add a hospital, grocery or other service and drag it around. Areas that save 15+ minutes turn green.'
                : 'Set a station to maintenance or shut down. Affected communities update immediately.'}
            </p>
            {!gain && (
              <p className="mt-3 text-[12px] text-fog-400">
                Maintenance keeps trains moving through. Shut down blocks the line.
              </p>
            )}
          </div>
        )}

        {impactPending && !result && (
          <div className="rounded-2xl border border-ink-700 bg-ink-850 px-4 py-8 text-center text-sm text-fog-400">
            Updating who is affected…
          </div>
        )}

        {error && !result && (
          <div className="rounded-2xl border border-line-red/30 bg-line-red/10 px-4 py-4 text-sm text-fog-100">
            {error ?? 'Could not update impact'}
          </div>
        )}

        {result && (
          <div className="space-y-5">
            {gain ? (
              <div className="rounded-2xl border border-emerald-400/35 bg-gradient-to-br from-emerald-500/15 to-ink-850 px-4 py-3">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-400">
                  <Sprout className="h-3.5 w-3.5" />
                  {impactPending ? 'Updating benefit' : 'Live benefit'}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-fog-300">
                  {addedCount} new {addedCount === 1 ? 'site' : 'sites'} placed. Green only appears where a
                  trip gets at least 15 minutes shorter.
                </p>
              </div>
            ) : (
            <div
              className={cn(
                'rounded-2xl border bg-gradient-to-br px-4 py-3',
                anyShutdown
                  ? 'border-line-red/35 from-line-red/20 to-ink-850'
                  : 'border-line-gold/35 from-line-gold/15 to-ink-850',
              )}
            >
              <div
                className={cn(
                  'flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em]',
                  anyShutdown ? 'text-line-red' : 'text-line-gold',
                )}
              >
                {anyShutdown ? (
                  <TriangleAlert className="h-3.5 w-3.5" />
                ) : (
                  <Wrench className="h-3.5 w-3.5" />
                )}
                {impactPending ? 'Updating impact' : 'Live impact'}
              </div>
              <ul className="mt-2 space-y-1">
                {disrupted.map(({ station, operating }) => (
                  <li key={station.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedStation(station.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left hover:bg-ink-800/80"
                    >
                      <span className="truncate text-sm font-medium text-fog-100">
                        {station.name}
                      </span>
                      <StatePill operating={operating} />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] leading-relaxed text-fog-300">
                {anyShutdown
                  ? 'Shut-down stations cut the line; trains cannot pass through.'
                  : 'Trains still pass through, but riders cannot board there.'}{' '}
                Each area keeps the faster of walking or riding.
              </p>
            </div>
            )}

            <ImpactSummary summary={result.summary} gain={gain} />
            <ForecastCharts />
            <IncomeEquity impacts={result.zoneImpacts} gain={gain} />
            <HospitalCapacityList hospitals={hospitalCapacity} />
            <PoiPressureList pressure={result.poiPressure} gain={gain} />
            <AffectedCommunities impacts={result.zoneImpacts} />
            {selectedZoneId && <TraceImpactPanel />}
          </div>
        )}
      </div>
    </aside>
  )
}

function HospitalCapacityList({ hospitals }: { hospitals: HospitalCapacity[] }) {
  const active = hospitals
    .filter(
      (item): item is HospitalCapacity & { capacity: number; loadRatio: number; demand: number } =>
        item.capacity != null && item.loadRatio != null && item.demand != null &&
        (item.incomingAdmissionsPerHour > 0 || item.addedDemand > 0 || item.atMaxCapacity),
    )
    .slice(0, 6)
  if (active.length === 0) return null

  const projectedTime = (minute: number) => {
    const day = Math.floor(minute / 1440)
    const clock = formatTime(minute % 1440)
    return day > 0 ? `${clock} +${day}d` : clock
  }

  return (
    <div>
      <h3 className="mb-2 px-1 text-sm font-semibold text-fog-100">Hospital load over time</h3>
      <p className="mb-2 px-1 text-[12px] leading-relaxed text-fog-400">
        Historical CMS occupancy is the starting state. Closure-induced admissions accumulate;
        reported length of stay controls how quickly those added beds become available again.
      </p>
      <div className="space-y-1">
        {active.map((item) => (
          <div
            key={item.poiId}
            className={`rounded-xl border px-3 py-2 text-fog-100 ${item.atMaxCapacity ? 'border-line-red/30 bg-line-red/10' : 'border-ink-700 bg-ink-850'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm">{item.poiName}</span>
              <span className={`shrink-0 text-sm font-medium tabular-nums ${item.atMaxCapacity ? 'text-line-red' : 'text-fog-100'}`}>
                {Math.round(item.loadRatio * 100)}%
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={`h-full rounded-full ${item.atMaxCapacity ? 'bg-line-red' : item.loadRatio >= 0.9 ? 'bg-line-gold' : 'bg-sky-400'}`}
                style={{ width: `${Math.min(100, item.loadRatio * 100)}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between gap-2 text-[10px] text-fog-500">
              <span>+{formatVisitorRate(item.addedDemand)} occupied since start</span>
              <span>
                {item.overflowPatients > 0
                  ? `${formatVisitorRate(item.overflowPatients)} overflow`
                  : item.projectedFullMinute != null
                    ? `full ${projectedTime(item.projectedFullMinute)}`
                    : `+${formatVisitorRate(item.incomingAdmissionsPerHour)}/hr`}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatePill({ operating }: { operating: StationOperatingState }) {
  const shutdown = operating === 'shutdown'
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        shutdown ? 'bg-line-red/15 text-line-red' : 'bg-line-gold/15 text-line-gold',
      )}
    >
      {shutdown ? 'Shut down' : 'Maintenance'}
    </span>
  )
}
