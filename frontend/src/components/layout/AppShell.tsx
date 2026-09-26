import { useEffect } from 'react'
import { ImpactPanel } from '@/components/impact/ImpactPanel'
import { TopNav } from '@/components/layout/TopNav'
import { CivicMap } from '@/components/map/CivicMap'
import { ScenarioSidebar } from '@/components/scenario/ScenarioSidebar'
import { useScenarioStore } from '@/store/scenarioStore'

export function AppShell() {
  const loadNetwork = useScenarioStore((state) => state.loadNetwork)
  const activeAppMode = useScenarioStore((state) => state.activeAppMode)

  useEffect(() => {
    void loadNetwork()
  }, [loadNetwork])

  return (
    <div className="flex h-full flex-col bg-ink-900">
      <TopNav />
      <div className="relative flex min-h-0 flex-1">
        <ScenarioSidebar />
        <main className="relative min-w-0 flex-1">
          <CivicMap />
          {activeAppMode !== 'simulate' && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink-950/55 p-8 backdrop-blur-[2px]">
              <ModePlaceholder mode={activeAppMode} />
            </div>
          )}
        </main>
        <ImpactPanel />
      </div>
    </div>
  )
}

function ModePlaceholder({ mode }: { mode: 'discover' | 'recover' }) {
  const copy =
    mode === 'discover'
      ? {
          title: 'Discover critical infrastructure',
          body: 'This mode will rank stations by how much accessibility collapses when they fail — surfacing hidden single points of failure in the MARTA graph.',
        }
      : {
          title: 'Recover in the right order',
          body: 'This mode will test restoration sequences and show which station coming back online returns the most people to essential services first.',
        }

  return (
    <div className="max-w-md rounded-2xl border border-ink-600 bg-ink-850/95 p-6 shadow-2xl">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-fog-400">
        Coming next
      </div>
      <h2 className="text-lg font-semibold text-fog-100">{copy.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-fog-400">{copy.body}</p>
    </div>
  )
}
