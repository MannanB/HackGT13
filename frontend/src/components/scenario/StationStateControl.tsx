import { ChevronDown, X } from 'lucide-react'
import { useScenarioStore } from '@/store/scenarioStore'
import { STATION_STATE_OPTIONS, type StationOperatingState } from '@/types/network'
import { MARTA_LINE_HEX } from '@/utils/constants'
import { cn } from '@/utils/cn'

const DOT: Record<StationOperatingState, string> = {
  normal: 'bg-fog-100',
  maintenance: 'bg-line-gold',
  shutdown: 'bg-line-red',
}

export function StationStateControl({
  stationId,
  compact = false,
}: {
  stationId: string
  compact?: boolean
}) {
  const status = useScenarioStore((state) =>
    stationId ? (state.stationStates[stationId] ?? 'normal') : 'normal',
  )
  const setStationState = useScenarioStore((state) => state.setStationState)
  const disabled = !stationId

  return (
    <label className="block">
      {!compact && <span className="mb-2 block text-xs text-fog-400">Station state</span>}
      <span className="relative block">
        <span
          className={cn(
            'pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full',
            DOT[status],
          )}
        />
        <select
          disabled={disabled}
          value={status}
          onChange={(event) =>
            setStationState(stationId, event.target.value as StationOperatingState)
          }
          className={cn(
            'w-full appearance-none rounded-xl border bg-ink-850 py-2.5 pr-9 pl-8 text-sm text-fog-100 outline-none transition-colors focus:border-signal disabled:opacity-50',
            status === 'shutdown' && 'border-line-red/50',
            status === 'maintenance' && 'border-line-gold/50',
            status === 'normal' && 'border-ink-600',
          )}
        >
          {STATION_STATE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} — {option.detail}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-fog-400" />
      </span>
    </label>
  )
}

export function MapStationEditor({
  stationId,
  x,
  y,
  onClose,
}: {
  stationId: string
  x: number
  y: number
  onClose: () => void
}) {
  const station = useScenarioStore((state) => state.stations.find((item) => item.id === stationId))

  return (
    <div
      className="absolute z-30 w-64 rounded-2xl border border-ink-600 bg-ink-900/95 p-3 shadow-2xl backdrop-blur-sm"
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-fog-100">
            {station?.name ?? 'Station'}
          </div>
          <div className="mt-1 flex items-center gap-1">
            {station?.lines.map((line) => (
              <span
                key={line}
                className="h-1.5 w-4 rounded-full"
                style={{ background: MARTA_LINE_HEX[line] }}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-fog-400 hover:bg-ink-700 hover:text-fog-100"
          aria-label="Close station editor"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <StationStateControl stationId={stationId} compact />
    </div>
  )
}
