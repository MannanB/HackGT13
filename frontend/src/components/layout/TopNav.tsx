import { Activity, Leaf, Play } from 'lucide-react'
import { useScenarioStore } from '@/store/scenarioStore'
import { cn } from '@/utils/cn'
import type { AppMode } from '@/types/simulation'

const modes: { id: AppMode; label: string; icon: typeof Play }[] = [
  { id: 'simulate', label: 'Simulate', icon: Play },
  { id: 'discover', label: 'Discover', icon: Activity },
  { id: 'recover', label: 'Recover', icon: Leaf },
]

export function TopNav() {
  const activeAppMode = useScenarioStore((state) => state.activeAppMode)
  const setAppMode = useScenarioStore((state) => state.setAppMode)

  return (
    <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-ink-700 bg-ink-900 px-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-700">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
            <path d="M4 18V6" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
            <path
              d="M4 12h6l3-4 5 8"
              stroke="#e8eef5"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="4" cy="12" r="1.6" fill="#ef4444" />
          </svg>
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight text-fog-100">
            Civic Stacktrace
          </div>
          <div className="hidden text-[11px] text-fog-400 sm:block">
            From broken systems to stronger communities.
          </div>
        </div>
      </div>

      <nav className="flex items-center rounded-full border border-ink-600 bg-ink-850 p-1">
        {modes.map((mode) => {
          const Icon = mode.icon
          const active = activeAppMode === mode.id
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => setAppMode(mode.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-ink-700 text-fog-100 shadow-sm'
                  : 'text-fog-400 hover:text-fog-100',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {mode.label}
            </button>
          )
        })}
      </nav>

      <div className="flex items-center justify-end gap-3">
        <div className="flex items-center gap-2 rounded-full border border-ink-600 bg-ink-850 px-3 py-1.5 text-xs text-fog-300">
          <span className="h-1.5 w-1.5 rounded-full bg-signal" />
          Atlanta (MARTA)
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-700 text-xs font-medium text-fog-300">
          CS
        </div>
      </div>
    </header>
  )
}
