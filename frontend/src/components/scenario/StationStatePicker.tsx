import { Segmented } from '@/components/ui/Segmented'
import { useScenarioStore } from '@/store/scenarioStore'
import { STATION_STATE_OPTIONS, type StationOperatingState } from '@/types/network'
import { cn } from '@/utils/cn'

const ACTIVE: Record<StationOperatingState, string> = {
  normal: 'bg-ink-700 text-fog-100 shadow-sm',
  maintenance: 'bg-maint/15 text-maint ring-1 ring-maint/40',
  shutdown: 'bg-shut/15 text-shut ring-1 ring-shut/40',
}

const DOT: Record<StationOperatingState, string> = {
  normal: 'bg-fog-300',
  maintenance: 'bg-maint',
  shutdown: 'bg-shut',
}

export function StationStatePicker({ stationId }: { stationId: string }) {
  const status = useScenarioStore((state) => state.stationStates[stationId] ?? 'normal')
  const setStationState = useScenarioStore((state) => state.setStationState)
  const detail = STATION_STATE_OPTIONS.find((option) => option.value === status)?.detail

  return (
    <div>
      <Segmented
        value={status}
        onChange={(next) => setStationState(stationId, next)}
        options={STATION_STATE_OPTIONS.map((option) => ({
          value: option.value,
          activeClass: ACTIVE[option.value],
          label: (
            <>
              <span className={cn('h-1.5 w-1.5 rounded-full', DOT[option.value])} />
              {option.label}
            </>
          ),
        }))}
      />
      <p className="mt-2 text-[11px] text-fog-500">{detail}</p>
    </div>
  )
}
