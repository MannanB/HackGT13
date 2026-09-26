import { Database, X } from 'lucide-react'
import { useBuildStore } from '@/store/buildStore'
import { useScenarioStore } from '@/store/scenarioStore'
import { hex } from '@/utils/constants'

/** Right-hand panel for the Build tab: what will happen, and what just happened. */
export function BuildPanel() {
  const stations = useScenarioStore((state) => state.stations)
  const edges = useScenarioStore((state) => state.transitEdges)
  const pois = useScenarioStore((state) => state.pois)
  const pending = useBuildStore((state) => state.pending)
  const target = useBuildStore((state) => state.target)
  const saved = useBuildStore((state) => state.saved)
  const error = useBuildStore((state) => state.error)
  const dismissSaved = useBuildStore((state) => state.dismissSaved)

  return (
    <aside className="glass scroll-thin pointer-events-auto flex max-h-full w-[340px] flex-col overflow-y-auto rounded-2xl">
      <div className="space-y-5 p-4">
        {!saved && !error && (
          <div className="rounded-2xl border border-dashed border-ink-600 bg-ink-850/60 px-4 py-8 text-center">
            <p className="text-sm leading-relaxed text-fog-300">
              {target
                ? pending
                  ? 'Remove the selected station from the sidebar, or connect it to the stop you are placing.'
                  : 'Remove the selected station from the sidebar, or click empty map to go back to adding.'
                : pending
                  ? 'Drag the stop into place, name it, and connect it to one or two stations, then save.'
                  : 'Click the map to drop a new train stop, then drag it. Click an existing station to select it.'}
            </p>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-fog-400">
              <Database className="h-3.5 w-3.5" />
              Unlike the other tabs, changes here are permanent and shared.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-shut/10 px-3 py-2 text-[12px] text-shut ring-1 ring-shut/30">{error}</div>
        )}

        {saved && (
          <div className="animate-rise rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/10">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-[12.5px] font-medium">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: hex(saved.color) }} />
                {saved.title}
              </div>
              <button
                type="button"
                onClick={dismissSaved}
                className="rounded-md p-1 text-fog-500 hover:bg-white/5 hover:text-fog-100"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-fog-400">
              {saved.details.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-fog-500">
              The network has been reloaded. Switch to Disrupt to test it.
            </p>
          </div>
        )}

        <div className="font-mono text-[10.5px] text-fog-500">
          {stations.length} stations · {Math.round(edges.length / 2)} rail links · {pois.length} destinations
        </div>
      </div>
    </aside>
  )
}
