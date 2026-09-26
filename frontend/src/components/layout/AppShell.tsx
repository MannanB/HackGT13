import { RefreshCw } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { BuildPanel } from '@/components/builder/BuildPanel'
import { IntelligencePanel } from '@/components/intelligence/IntelligencePanel'
import { ImpactPanel } from '@/components/impact/ImpactPanel'
import { CivicMap } from '@/components/map/CivicMap'
import { ScenarioSidebar } from '@/components/scenario/ScenarioSidebar'
import { TimeSlider } from '@/components/timeline/TimeSlider'
import { useScenarioStore } from '@/store/scenarioStore'

export function AppShell() {
  const loadNetwork = useScenarioStore((state) => state.loadNetwork)
  const loadStatus = useScenarioStore((state) => state.loadStatus)
  const loadError = useScenarioStore((state) => state.loadError)
  const appMode = useScenarioStore((state) => state.appMode)
  const [timelineOpen, setTimelineOpen] = useState(false)
  useEffect(() => {
    void loadNetwork()
  }, [loadNetwork])

  return (
    <div
      className="relative h-full overflow-hidden bg-ink-950"
      style={{ '--timeline-clearance': timelineOpen ? '8.75rem' : '4.75rem' } as CSSProperties}
    >
      <CivicMap />
      <div className="glass pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-2.5 rounded-2xl py-2 pr-4 pl-2">
        <svg viewBox="0 0 32 32" aria-hidden="true" className="h-9 w-9 shrink-0">
          <rect width="32" height="32" rx="8" fill="#1c2434" />
          <path d="M7 22V10" stroke="#3b82f6" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M7 16h8l4-5 6 11" stroke="#e8eef5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="7" cy="16" r="2" fill="#ef4444" />
        </svg>
        <span className="text-lg font-semibold tracking-tight text-fog-100">Ripple</span>
      </div>
      {loadStatus === 'ready' && (
        <>
          <div className="pointer-events-none absolute inset-3 z-10 flex items-start justify-between gap-3 pb-[var(--timeline-clearance)] transition-[padding] duration-300">
            <ScenarioSidebar />
            {appMode === 'intel' ? <IntelligencePanel /> : appMode === 'build' ? <BuildPanel /> : <ImpactPanel />}
          </div>
          <TimeSlider open={timelineOpen} onToggle={() => setTimelineOpen((open) => !open)} />
        </>
      )}
      {loadStatus === 'error' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink-950/70 backdrop-blur-sm">
          <div className="glass w-[340px] rounded-2xl p-6 text-center">
            <div className="font-serif text-[22px]">Couldn't reach the data API</div>
            <p className="mt-2 text-[12.5px] text-fog-400">{loadError}</p>
            <button
              type="button"
              onClick={() => void loadNetwork()}
              className="mx-auto mt-4 flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 py-1.5 text-[12px] ring-1 ring-white/10 hover:bg-white/10"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
