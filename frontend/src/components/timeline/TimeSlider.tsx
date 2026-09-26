import { ChevronUp, Clock3 } from 'lucide-react'
import { useScenarioStore } from '@/store/scenarioStore'
import { cn } from '@/utils/cn'
import { formatTime } from '@/utils/hourlyDemand'

function formatElapsed(minutes: number): string {
  const bounded = Math.max(0, Math.min(1440, Math.round(minutes)))
  const hours = Math.floor(bounded / 60)
  const remainder = bounded % 60
  if (hours === 0) return `${remainder}m`
  if (remainder === 0) return `${hours}h`
  return `${hours}h ${remainder}m`
}

export function TimeSlider({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const timeMinute = useScenarioStore((state) => state.timeMinute)
  const failureStartMinute = useScenarioStore((state) => state.failureStartMinute)
  const failureElapsedMinutes = useScenarioStore((state) => state.failureElapsedMinutes)
  const setFailureStartMinute = useScenarioStore((state) => state.setFailureStartMinute)
  const setFailureElapsedMinutes = useScenarioStore((state) => state.setFailureElapsedMinutes)

  return (
    <section className="glass pointer-events-auto absolute bottom-3 left-1/2 z-30 w-[min(760px,calc(100%-32px))] -translate-x-1/2 rounded-2xl px-4 py-2.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Clock3 className="h-3.5 w-3.5 text-accent" />
          <span className="eyebrow text-fog-400">Closure timeline</span>
        </div>
        <span className="flex items-center gap-2">
          <output className="font-mono text-sm font-semibold tabular-nums text-fog-100">
            Now {formatTime(timeMinute)}
          </output>
          <ChevronUp className={cn('h-3.5 w-3.5 text-fog-400 transition-transform duration-300', open && 'rotate-180')} />
        </span>
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden" inert={!open}>
          <div className="grid grid-cols-2 gap-5 pt-2.5">
            <TimelineControl
              label="Start time"
              valueLabel={formatTime(failureStartMinute)}
              min={0}
              max={1439}
              value={failureStartMinute}
              onChange={setFailureStartMinute}
              ticks={['12 AM', '6 AM', '12 PM', '6 PM', '11:59 PM']}
            />
            <TimelineControl
              label="Time since failure"
              valueLabel={formatElapsed(failureElapsedMinutes)}
              min={0}
              max={1440}
              value={failureElapsedMinutes}
              onChange={setFailureElapsedMinutes}
              ticks={['0h', '6h', '12h', '18h', '24h']}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function TimelineControl({
  label,
  valueLabel,
  min,
  max,
  value,
  onChange,
  ticks,
}: {
  label: string
  valueLabel: string
  min: number
  max: number
  value: number
  onChange: (minute: number) => void
  ticks: string[]
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="eyebrow text-fog-400">{label}</span>
        <output className="font-mono text-[12px] font-semibold tabular-nums text-fog-100">{valueLabel}</output>
      </div>
      <input
        aria-label={label}
        className="timeline-range block w-full"
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <div className="mt-1 flex justify-between font-mono text-[9.5px] text-fog-500">
        {ticks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
    </div>
  )
}
