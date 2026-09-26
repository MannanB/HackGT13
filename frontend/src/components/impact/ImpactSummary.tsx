import { Clock3, House, Users } from 'lucide-react'
import { useCountUp } from '@/utils/useCountUp'
import { formatPopulation } from '@/utils/constants'
import type { ImpactSummary as ImpactSummaryData } from '@/types/simulation'

export function ImpactSummary({ summary, gain }: { summary: ImpactSummaryData; gain: boolean }) {
  const population = useCountUp(summary.populationAffected)
  const delay = useCountUp(summary.averageAddedTravelMinutes)
  const lost = useCountUp(summary.zonesAffected)

  const metrics = [
    {
      icon: Users,
      label: gain ? 'Population benefiting' : 'Population affected',
      value: formatPopulation(population),
      suffix: ' residents',
      note: 'highlighted areas',
    },
    {
      icon: Clock3,
      label: gain ? 'Avg. time saved' : 'Avg. added travel time',
      value: `${gain ? '−' : '+'}${Math.round(delay)}`,
      suffix: ' min',
      note: 'vs. normal',
    },
    {
      icon: House,
      label: gain ? 'Regions improved' : 'Regions slowed',
      value: Math.round(lost).toString(),
      note: gain ? 'shorter trip than before' : 'longer trip than before',
    },
  ]

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-fog-100">Estimated impact</h3>
        <span className="text-[10px] uppercase tracking-[0.12em] text-fog-400">
          Compared to typical service
        </span>
      </div>
      {metrics.map((metric) => {
        const Icon = metric.icon
        return (
          <div
            key={metric.label}
            className="flex items-center justify-between rounded-xl border border-ink-700 bg-ink-850 px-3 py-2.5"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-700 text-fog-300">
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <div className="text-[11px] text-fog-400">{metric.label}</div>
                <div className="text-lg font-semibold tabular-nums text-fog-100">
                  {metric.value}
                  {metric.suffix ?? ''}
                </div>
              </div>
            </div>
            <div className={`text-right text-[11px] ${gain ? 'text-emerald-400' : 'text-line-red'}`}>{metric.note}</div>
          </div>
        )
      })}
    </div>
  )
}
