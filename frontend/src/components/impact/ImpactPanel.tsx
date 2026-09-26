import { AnimatePresence, motion } from 'framer-motion'
import { TriangleAlert } from 'lucide-react'
import { AffectedCommunities } from '@/components/impact/AffectedCommunities'
import { ImpactSummary } from '@/components/impact/ImpactSummary'
import { PoiPressureList } from '@/components/impact/PoiPressureList'
import { TraceImpactPanel } from '@/components/trace/TraceImpactPanel'
import { useScenarioStore } from '@/store/scenarioStore'

export function ImpactPanel() {
  const status = useScenarioStore((state) => state.simulationStatus)
  const result = useScenarioStore((state) => state.simulationResult)
  const stations = useScenarioStore((state) => state.stations)
  const selectedStationId = useScenarioStore((state) => state.selectedStationId)
  const selectedZoneId = useScenarioStore((state) => state.selectedZoneId)
  const error = useScenarioStore((state) => state.simulationError)
  const station = stations.find((item) => item.id === selectedStationId)

  return (
    <aside className="civic-scroll z-10 flex w-[340px] shrink-0 flex-col overflow-auto border-l border-ink-700 bg-ink-900">
      <div className="space-y-5 p-4">
        <AnimatePresence mode="wait">
          {status === 'idle' && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="rounded-2xl border border-dashed border-ink-600 bg-ink-850/60 px-4 py-8 text-center"
            >
              <p className="text-sm leading-relaxed text-fog-300">
                Select a station and run a disruption scenario to see downstream effects.
              </p>
              <p className="mt-3 text-[12px] text-fog-400">
                Accessibility is how easy a trip is today. Resilience is how that trip
                changes when a station fails.
              </p>
            </motion.div>
          )}

          {status === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl border border-ink-700 bg-ink-850 px-4 py-8 text-center text-sm text-fog-400"
            >
              Recomputing access paths through the MARTA graph…
            </motion.div>
          )}

          {status === 'error' && (
            <div className="rounded-2xl border border-line-red/30 bg-line-red/10 px-4 py-4 text-sm text-fog-100">
              {error ?? 'Simulation failed'}
            </div>
          )}

          {status === 'success' && result && (
            <motion.div
              key={result.scenario.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              <div className="rounded-2xl border border-line-red/35 bg-gradient-to-br from-line-red/20 to-ink-850 px-4 py-3">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-line-red">
                  <TriangleAlert className="h-3.5 w-3.5" />
                  Station offline
                </div>
                <div className="mt-1 text-lg font-semibold text-fog-100">
                  {station?.name ?? selectedStationId}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-fog-300">
                  {result.scenario.description}. Downstream travel times are compared
                  against typical service.
                </p>
              </div>

              <ImpactSummary summary={result.summary} active />
              <PoiPressureList pressure={result.poiPressure} />
              <AffectedCommunities impacts={result.zoneImpacts} />
              {selectedZoneId && <TraceImpactPanel />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  )
}
