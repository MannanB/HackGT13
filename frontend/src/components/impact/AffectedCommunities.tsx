import { useScenarioStore } from '@/store/scenarioStore'
import { cn } from '@/utils/cn'
import { delayHex } from '@/utils/constants'
import type { ZoneImpact } from '@/types/simulation'

export function AffectedCommunities({ impacts }: { impacts: ZoneImpact[] }) {
  const selectedZoneId = useScenarioStore((state) => state.selectedZoneId)
  const selectZone = useScenarioStore((state) => state.selectZone)
  const ranked = impacts.filter((item) => item.delayMinutes > 0).slice(0, 10)

  return (
    <div>
      <h3 className="mb-2 px-1 text-sm font-semibold text-fog-100">
        Most affected communities
      </h3>
      <div className="space-y-1">
        {ranked.map((impact) => {
          const selected = impact.zoneId === selectedZoneId
          return (
            <button
              key={impact.zoneId}
              type="button"
              onClick={() => selectZone(selected ? null : impact.zoneId)}
              className={cn(
                'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-colors',
                selected
                  ? 'bg-ink-700 text-fog-100'
                  : 'text-fog-300 hover:bg-ink-800 hover:text-fog-100',
              )}
            >
              <span className="truncate pr-2 text-sm">{impact.zoneName}</span>
              <span
                className="font-mono text-sm tabular-nums"
                style={{ color: delayHex(impact.delayMinutes) }}
              >
                +{impact.delayMinutes} min
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
