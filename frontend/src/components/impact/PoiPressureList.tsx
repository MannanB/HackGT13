import { formatPopulation } from '@/utils/constants'
import type { PoiPressure } from '@/types/simulation'

export function PoiPressureList({ pressure, gain }: { pressure: PoiPressure[]; gain: boolean }) {
  const ranked = pressure.slice(0, 6)
  if (ranked.length === 0) return null

  return (
    <div>
      <h3 className="mb-2 px-1 text-sm font-semibold text-fog-100">
        {gain ? 'New destinations drawing demand' : 'Destinations under more pressure'}
      </h3>
      <p className="mb-2 px-1 text-[12px] leading-relaxed text-fog-400">
        {gain
          ? 'Modeled transit-dependent trips/day that would switch to it.'
          : 'Modeled transit-dependent trips/day shifted here after the closure.'}
      </p>
      <div className="space-y-1">
        {ranked.map((item) => (
          <div
            key={item.poiId}
            className="flex items-center justify-between rounded-xl px-3 py-2 text-fog-100"
          >
            <span className="min-w-0 truncate pr-2 text-sm">{item.poiName}</span>
            <span className="shrink-0 text-right">
              <span className={`block text-sm font-medium tabular-nums ${gain ? 'text-emerald-400' : 'text-impact-2'}`}>
                +{formatPopulation(item.addedDemand)} trips/day
              </span>
              <span className="block text-[10px] text-fog-500">
                {item.loadRatio == null
                  ? 'capacity unknown'
                  : `${item.loadRatio.toFixed(1)}× capacity`}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
