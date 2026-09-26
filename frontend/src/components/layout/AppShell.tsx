import { Loader2, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { IntelligencePanel } from '@/components/intelligence/IntelligencePanel'
import { ImpactPanel } from '@/components/impact/ImpactPanel'
import { CivicMap } from '@/components/map/CivicMap'
import { ScenarioSidebar } from '@/components/scenario/ScenarioSidebar'
import { useScenarioStore } from '@/store/scenarioStore'

export function AppShell() {
  const loadNetwork = useScenarioStore((state) => state.loadNetwork)
  const loadStatus = useScenarioStore((state) => state.loadStatus)
  const loadError = useScenarioStore((state) => state.loadError)
  const appMode = useScenarioStore((state) => state.appMode)

  useEffect(() => {
    void loadNetwork()
  }, [loadNetwork])

  return (
    <div className="relative h-full overflow-hidden bg-ink-950">
      <CivicMap />
      {loadStatus === 'ready' && (
        <div className="pointer-events-none absolute inset-3 z-10 flex items-start justify-between gap-3">
          <ScenarioSidebar />
          {appMode === 'intel' ? <IntelligencePanel /> : <ImpactPanel />}
        </div>
      )}
      {loadStatus !== 'ready' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink-950/70 backdrop-blur-sm">
          <div className="glass w-[340px] rounded-2xl p-6 text-center">
            {loadStatus === 'loading' ? (
              <>
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-accent" />
                <div className="mt-3 text-[13px] text-fog-300">Loading MARTA network, block groups and destinations…</div>
              </>
            ) : (
              <>
                <div className="font-serif text-[22px]">Couldn't reach the data API</div>
                <p className="mt-2 text-[12.5px] text-fog-400">{loadError}</p>
                <button
                  type="button"
                  onClick={() => void loadNetwork()}
                  className="mx-auto mt-4 flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 py-1.5 text-[12px] ring-1 ring-white/10 hover:bg-white/10"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Retry
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
