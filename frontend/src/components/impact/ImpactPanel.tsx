import { Sprout, TriangleAlert, Wrench } from 'lucide-react'
import { AffectedCommunities } from '@/components/impact/AffectedCommunities'
import { ImpactSummary } from '@/components/impact/ImpactSummary'
import { IncomeEquity } from '@/components/impact/IncomeEquity'
import { PoiPressureList } from '@/components/impact/PoiPressureList'
import { TraceImpactPanel } from '@/components/trace/TraceImpactPanel'
import { useScenarioStore } from '@/store/scenarioStore'
import type { StationOperatingState } from '@/types/network'
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
  const anyShutdown = disrupted.some((item) => item.operating === 'shutdown')

  return (
    <aside className="glass scroll-thin pointer-events-auto flex max-h-full w-[340px] flex-col overflow-y-auto rounded-2xl">
      <div className="space-y-5 p-4">
        {!result && !error && !impactPending && (
          <div className="rounded-2xl border border-dashed border-ink-600 bg-ink-850/60 px-4 py-8 text-center">
            <p className="text-sm leading-relaxed text-fog-300">
              {gain
                ? 'Add a hospital, grocery or other service and drag it around. Areas that save 15+ minutes turn green.'
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
            <IncomeEquity impacts={result.zoneImpacts} gain={gain} />
            <PoiPressureList pressure={result.poiPressure} gain={gain} />
            <AffectedCommunities impacts={result.zoneImpacts} />
            {selectedZoneId && <TraceImpactPanel />}
          </div>
        )}
      </div>
    </aside>
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
