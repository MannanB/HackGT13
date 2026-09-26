import { Info } from 'lucide-react'
import { BeforeAfterComparison } from '@/components/trace/BeforeAfterComparison'
import { DependencyChain } from '@/components/trace/DependencyChain'
import { useScenarioStore } from '@/store/scenarioStore'
import { cn } from '@/utils/cn'

export function TraceImpactPanel() {
  const trace = useScenarioStore((state) => state.traceImpact)
  const traceStatus = useScenarioStore((state) => state.traceStatus)
  const failedStations = useScenarioStore(
    (state) => state.simulationResult?.failedStations ?? [],
  )
  const beforeAfterMode = useScenarioStore((state) => state.beforeAfterMode)
  const setBeforeAfterMode = useScenarioStore((state) => state.setBeforeAfterMode)
  const zones = useScenarioStore((state) => state.zones)
  const selectedZoneId = useScenarioStore((state) => state.selectedZoneId)
  const zoneName = zones.find((zone) => zone.id === selectedZoneId)?.name

  if (traceStatus === 'loading') {
    return (
      <div className="rounded-xl border border-ink-700 bg-ink-850 px-3 py-4 text-sm text-fog-400">
        Tracing dependency path…
      </div>
    )
  }

  if (!trace) return null

  const modes = [
    { id: 'both' as const, label: 'Both' },
    { id: 'normal' as const, label: 'Before' },
    { id: 'disrupted' as const, label: 'After' },
  ]

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fog-100">
            Trace impact
            <Info className="h-3.5 w-3.5 text-fog-400" />
          </h3>
          <p className="mt-1 text-[12px] leading-relaxed text-fog-400">
            Why {zoneName ?? 'this community'} takes longer under the current station states.
          </p>
        </div>
      </div>

      <BeforeAfterComparison trace={trace} />

      <div className="flex rounded-full border border-ink-600 bg-ink-850 p-1">
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => setBeforeAfterMode(mode.id)}
            className={cn(
              'flex-1 rounded-full px-2 py-1 text-[11px] font-medium',
              beforeAfterMode === mode.id
                ? 'bg-ink-700 text-fog-100'
                : 'text-fog-400 hover:text-fog-100',
            )}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <DependencyChain
        path={
          beforeAfterMode === 'disrupted' ? trace.disruptedPath : trace.normalPath
        }
        label={beforeAfterMode === 'disrupted' ? 'Rerouted path' : 'Normal dependency'}
        failedStationIds={failedStations}
      />
    </section>
  )
}
