const formatMinutes = (value: number) => `${Math.round(value)} min`
import type { TraceImpact } from '@/types/simulation'

export function BeforeAfterComparison({ trace, gain }: { trace: TraceImpact; gain: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Stat label="Before" value={formatMinutes(trace.normalTravelMinutes)} />
      <Stat
        label="After"
        value={formatMinutes(trace.disruptedTravelMinutes)}
      />
      <Stat
        label="Change"
        value={`${gain ? '−' : '+'}${trace.delayMinutes} min`}
        emphasis={gain ? 'gain' : 'loss'}
      />
    </div>
  )
}

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: 'gain' | 'loss'
}) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-fog-400">{label}</div>
      <div
        className={`mt-1 text-sm font-semibold tabular-nums ${emphasis === 'gain' ? 'text-emerald-400' : emphasis ? 'text-line-red' : 'text-fog-100'}`}
      >
        {value}
      </div>
    </div>
  )
}
