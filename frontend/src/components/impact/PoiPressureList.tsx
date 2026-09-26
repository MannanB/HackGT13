import { formatPopulation } from '@/utils/constants'
import type { PoiPressure } from '@/types/simulation'

export function PoiPressureList({ pressure }: { pressure: PoiPressure[] }) {
  const ranked = pressure.slice(0, 6)
  if (ranked.length === 0) return null

  return (
    <div>
      <h3 className="mb-2 px-1 text-sm font-semibold text-fog-100">
        Destinations under more pressure
      </h3>
      <p className="mb-2 px-1 text-[12px] leading-relaxed text-fog-400">
        Regions that switch here after the closure.
      </p>
      <div className="space-y-1">
        {ranked.map((item) => (
          <div
            key={item.poiId}
            className="flex items-center justify-between rounded-xl px-3 py-2 text-fog-100"
          >
            <span className="truncate pr-2 text-sm">{item.poiName}</span>
            <span className="shrink-0 text-sm font-medium tabular-nums text-impact-2">
              +{formatPopulation(item.addedRegions)} regions
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}