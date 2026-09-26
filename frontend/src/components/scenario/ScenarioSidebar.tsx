import { ServiceLayerToggle } from '@/components/scenario/ServiceLayerToggle'
import { StationSelector } from '@/components/scenario/StationSelector'
import { StationStateControl } from '@/components/scenario/StationStateControl'
import { useScenarioStore } from '@/store/scenarioStore'

export function ScenarioSidebar() {
  const selectedStationId = useScenarioStore((state) => state.selectedStationId)
  const stationStates = useScenarioStore((state) => state.stationStates)
  const resetStationStates = useScenarioStore((state) => state.resetStationStates)
  const disrupted = Object.values(stationStates).some((status) => status !== 'normal')

  return (
    <aside className="glass scroll-thin pointer-events-auto flex max-h-full w-[320px] flex-col overflow-y-auto rounded-2xl">
      <div className="space-y-6 p-4">
        <section>
          <Step n={1} title="Select a station">
            Click a station on the map, or choose one here.
          </Step>
          <div className="mt-3 space-y-3">
            <div>
              <div className="mb-2 text-xs text-fog-400">Select a station</div>
              <StationSelector />
            </div>
          </div>
        </section>

        <section>
          <Step n={2} title="Set its state">
            Maintenance keeps trains moving through the station. Shut down stops trains from passing.
          </Step>
          <div className="mt-3 space-y-2">
            {selectedStationId && <StationStateControl stationId={selectedStationId} />}
            {disrupted && (
              <button
                type="button"
                onClick={resetStationStates}
                className="w-full text-center text-xs text-fog-400 hover:text-fog-100"
              >
                Restore all stations
              </button>
            )}
          </div>
        </section>

        <section>
          <Step n={3} title="Category weights">
            Higher weights count more. A hospital delay outweighs the same delay to a grocery store.
          </Step>
          <div className="mt-3">
            <ServiceLayerToggle />
          </div>
        </section>
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
