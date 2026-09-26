import { MARTA_LINE_HEX, IMPACT_BREAKS } from '@/utils/constants'

export function MapLegend({ simulated }: { simulated: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="absolute left-4 top-4 rounded-xl border border-ink-600 bg-ink-900/92 px-3 py-2.5 shadow-xl backdrop-blur-sm">
        <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-fog-400">
          MARTA Network
        </div>
        <ul className="space-y-1.5 text-xs text-fog-100">
          {(
            [
              ['red', 'Red Line'],
              ['gold', 'Gold Line'],
              ['blue', 'Blue Line'],
              ['green', 'Green Line'],
            ] as const
          ).map(([line, label]) => (
            <li key={line} className="flex items-center gap-2">
              <span
                className="h-1.5 w-4 rounded-full"
                style={{ background: MARTA_LINE_HEX[line] }}
              />
              {label}
            </li>
          ))}
        </ul>
      </div>

      {simulated && (
        <div className="absolute bottom-8 right-4 rounded-xl border border-ink-600 bg-ink-900/92 px-3 py-2.5 shadow-xl backdrop-blur-sm">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-fog-400">
            Increase in travel time (minutes)
          </div>
          <div className="flex items-center gap-1">
            {IMPACT_BREAKS.map((bucket) => (
              <div key={bucket.label} className="flex flex-col items-center gap-1">
                <span
                  className="h-2 w-10 rounded-sm"
                  style={{ background: bucket.hex }}
                />
                <span className="text-[10px] text-fog-400">{bucket.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
