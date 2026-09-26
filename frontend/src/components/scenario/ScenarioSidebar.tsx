import { ChevronDown, Train } from 'lucide-react'
import { ServiceLayerToggle } from '@/components/scenario/ServiceLayerToggle'
import { SimulationButton } from '@/components/scenario/SimulationButton'
import { StationSelector } from '@/components/scenario/StationSelector'
import { useScenarioStore } from '@/store/scenarioStore'

export function ScenarioSidebar() {
  const resetSimulation = useScenarioStore((state) => state.resetSimulation)
  const status = useScenarioStore((state) => state.simulationStatus)

  return (
    <aside className="civic-scroll z-10 flex w-[320px] shrink-0 flex-col overflow-auto border-r border-ink-700 bg-ink-900">
      <div className="space-y-6 p-4">
        <section>
          <Step n={1} title="Select infrastructure">
            Choose a MARTA station to simulate a disruption and see downstream impacts.
          </Step>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-ink-600 bg-ink-850 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm text-fog-100">
                <Train className="h-4 w-4 text-fog-400" />
                MARTA Rail Network
              </span>
              <ChevronDown className="h-4 w-4 text-fog-400" />
            </div>
            <div>
              <div className="mb-2 text-xs text-fog-400">Select a station</div>
              <StationSelector />
            </div>
          </div>
        </section>

        <section>
          <Step n={2} title="Include essential services">
            Show how the disruption affects access to key community resources.
          </Step>
          <div className="mt-3">
            <ServiceLayerToggle />
          </div>
        </section>

        <section>
          <Step n={3} title="Run simulation">
            Model network impacts, travel time changes, and access to essential services.
          </Step>
          <div className="mt-3 space-y-2">
            <SimulationButton />
            {status !== 'idle' && (
              <button
                type="button"
                onClick={resetSimulation}
                className="w-full text-center text-xs text-fog-400 hover:text-fog-100"
              >
                Reset scenario
              </button>
            )}
          </div>
        </section>
      </div>

      <div className="mt-auto border-t border-ink-700 p-4">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-xs text-fog-400"
          disabled
        >
          Advanced settings
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  )
}

function Step({
  n,
  title,
  children,
}: {
  n: number
  title: string
  children: string
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-fog-100">
        {n}. {title}
      </h2>
      <p className="mt-1 text-[12px] leading-relaxed text-fog-400">{children}</p>
    </div>
  )
}
