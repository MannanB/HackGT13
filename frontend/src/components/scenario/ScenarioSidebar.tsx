import { AddInfrastructure, PlacedPoiList } from '@/components/scenario/AddInfrastructure'
import { ServiceLayerToggle } from '@/components/scenario/ServiceLayerToggle'
import { StationSelector } from '@/components/scenario/StationSelector'
import { StationStateControl } from '@/components/scenario/StationStateControl'
import { useScenarioStore } from '@/store/scenarioStore'

export function ScenarioSidebar() {
  const selectedStationId = useScenarioStore((state) => state.selectedStationId)
  const stationStates = useScenarioStore((state) => state.stationStates)
  const resetStationStates = useScenarioStore((state) => state.resetStationStates)
  const appMode = useScenarioStore((state) => state.appMode)
  const addedPois = useScenarioStore((state) => state.addedPois)
  const closedCount = useScenarioStore((state) => Object.keys(state.closedPoiIds).length)
  const destroyedCount = useScenarioStore((state) => Object.keys(state.destroyedPoiIds).length)
  const evacuation = useScenarioStore((state) => state.evacuation)
  const intelEvent = useScenarioStore((state) => state.intelEvent)
  const disrupted = Object.values(stationStates).some((status) => status !== 'normal')
  const simulated = disrupted || closedCount > 0 || destroyedCount > 0 || evacuation != null || intelEvent != null

  return (
    <aside className="glass scroll-thin pointer-events-auto flex max-h-full w-[320px] flex-col overflow-y-auto rounded-2xl">
      <div className="space-y-6 p-4">
        {appMode === 'intel' ? (
          <section className="space-y-2">
            <h2 className="eyebrow">Event</h2>
            <p className="text-[12.5px] leading-relaxed text-fog-400">
              Use the chat on the right to describe a shock to the city. Station closures and new sites
              will be proposed from that event.
            </p>
          </section>
        ) : appMode === 'add' ? (
          <section className="space-y-2">
            <h2 className="eyebrow">Add infrastructure</h2>
            <AddInfrastructure />
          </section>
        ) : (
        <section className="space-y-2">
          <h2 className="eyebrow">Station</h2>
          <StationSelector />
          {selectedStationId && <StationStateControl stationId={selectedStationId} compact />}
          {simulated && (
            <button
              type="button"
              onClick={resetStationStates}
              className="w-full text-center text-xs text-fog-400 hover:text-fog-100"
            >
              Restore all stations
            </button>
          )}
        </section>
        )}

        {appMode === 'disrupt' && addedPois.length > 0 && (
          <section className="space-y-2">
            <h2 className="eyebrow">Added destinations</h2>
            <PlacedPoiList />
            <p className="text-[11px] text-fog-500">These sites stay in the disruption model.</p>
          </section>
        )}

        {appMode !== 'intel' && (
        <section className="space-y-2">
          <h2 className="eyebrow">Destinations</h2>
          <ServiceLayerToggle />
        </section>
        )}
      </div>
    </aside>
  )
}
