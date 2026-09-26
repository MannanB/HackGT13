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
        <section className="space-y-2">
          <h2 className="eyebrow">Station</h2>
          <StationSelector />
          {selectedStationId && <StationStateControl stationId={selectedStationId} compact />}
          {disrupted && (
            <button
              type="button"
              onClick={resetStationStates}
              className="w-full text-center text-xs text-fog-400 hover:text-fog-100"
            >
              Restore all stations
            </button>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="eyebrow">Destination weights</h2>
          <ServiceLayerToggle />
        </section>
      </div>
    </aside>
  )
}
