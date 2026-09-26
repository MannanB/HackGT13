import { Loader2, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { ImpactPanel } from '@/components/impact/ImpactPanel'
import { CivicMap } from '@/components/map/CivicMap'
import { ScenarioSidebar } from '@/components/scenario/ScenarioSidebar'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useScenarioStore } from '@/store/scenarioStore'

export function AppShell() {
  const loadNetwork = useScenarioStore((state) => state.loadNetwork)
  const loadStatus = useScenarioStore((state) => state.loadStatus)
  const loadError = useScenarioStore((state) => state.loadError)
  const criticalProgress = useScenarioStore((state) => state.poiCriticalProgress)
  const criticalFromCache = useScenarioStore((state) => state.criticalFromCache)
  const ready = loadStatus === 'ready' && (criticalProgress >= 1 || criticalFromCache)
  const overall = loadStatus === 'ready' ? 0.1 + criticalProgress * 0.9 : 0.05

  useEffect(() => {
    void loadNetwork()
  }, [loadNetwork])

  return (
    <div className="relative h-full overflow-hidden bg-ink-950">
      <CivicMap />
      {ready && (
        <div className="pointer-events-none absolute inset-3 z-10 flex items-start justify-between gap-3">
          <ScenarioSidebar />
          <ImpactPanel />
        </div>
      )}
      {!ready && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink-950">
          <div className="glass w-[340px] rounded-2xl p-6 text-center">
            {loadStatus !== 'error' ? (
              <>
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-accent" />
                <div className="mt-3 text-[13px] text-fog-300">
                  {loadStatus === 'loading'
                    ? 'Loading MARTA network, block groups and destinations…'
                    : 'Testing every station failure…'}
                </div>
                <div className="mt-4 mb-1.5 flex justify-between font-mono text-[10.5px] text-fog-500">
                  <span>{loadStatus === 'loading' ? 'Step 1 of 2' : 'Step 2 of 2'}</span>
                  <span>{Math.round(overall * 100)}%</span>
                </div>
                <ProgressBar value={overall} className="bg-accent" />
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
