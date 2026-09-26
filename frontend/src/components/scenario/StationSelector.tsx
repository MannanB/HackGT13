import { Check, ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useScenarioStore } from '@/store/scenarioStore'
import { MARTA_LINE_HEX } from '@/utils/constants'
import { cn } from '@/utils/cn'

export function StationSelector() {
  const stations = useScenarioStore((state) => state.stations)
  const selectedStationId = useScenarioStore((state) => state.selectedStationId)
  const stationStates = useScenarioStore((state) => state.stationStates)
  const setSelectedStation = useScenarioStore((state) => state.setSelectedStation)
  const [open, setOpen] = useState(false)

  const selectable = useMemo(
    () => stations.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [stations],
  )
  const selected = stations.find((station) => station.id === selectedStationId)
  const selectedState = stationStates[selectedStationId] ?? 'normal'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between rounded-xl border border-ink-600 bg-ink-850 px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              selectedState === 'shutdown' && 'bg-line-red',
              selectedState === 'maintenance' && 'bg-line-gold',
              selectedState === 'normal' && 'bg-signal',
            )}
          />
          <span className="text-sm text-fog-100">{selected?.name ?? 'Select a station'}</span>
          {selectedState !== 'normal' && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                selectedState === 'shutdown'
                  ? 'bg-line-red/15 text-line-red'
                  : 'bg-line-gold/15 text-line-gold',
              )}
            >
              {selectedState === 'shutdown' ? 'Shut down' : 'Maintenance'}
            </span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 text-fog-400" />
      </button>
      {open && (
        <div className="civic-scroll absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-ink-600 bg-ink-800 p-1 shadow-xl">
          {selectable.map((station) => (
            <button
              key={station.id}
              type="button"
              onClick={() => {
                setSelectedStation(station.id)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm',
                station.id === selectedStationId
                  ? 'bg-ink-700 text-fog-100'
                  : 'text-fog-300 hover:bg-ink-700/70 hover:text-fog-100',
              )}
            >
              <span className="flex items-center gap-2">
                <span>{station.name}</span>
                {stationStates[station.id] === 'shutdown' && (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-line-red">
                    Shut down
                  </span>
                )}
                {stationStates[station.id] === 'maintenance' && (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-line-gold">
                    Maintenance
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1">
                {station.lines.map((line) => (
                  <span
                    key={line}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: MARTA_LINE_HEX[line] }}
                  />
                ))}
                {station.id === selectedStationId && <Check className="ml-1 h-3.5 w-3.5" />}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
