import { Loader2, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { interpretEvent } from '@/services/intelligenceService'
import { useScenarioStore } from '@/store/scenarioStore'

export function IntelligencePanel() {
  const stations = useScenarioStore((state) => state.stations)
  const event = useScenarioStore((state) => state.intelEvent)
  const narrative = useScenarioStore((state) => state.intelNarrative)
  const applyIntelEvent = useScenarioStore((state) => state.applyIntelEvent)
  const computing = useScenarioStore((state) => state.computing)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastPrompt, setLastPrompt] = useState<string | null>(null)

  const generate = async (form: FormEvent) => {
    form.preventDefault()
    const next = prompt.trim()
    if (!next || busy) return
    setBusy(true)
    setError(null)
    setLastPrompt(next)
    try {
      const result = await interpretEvent(next, stations)
      applyIntelEvent(result.event, result.narrative)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not interpret the event')
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="glass pointer-events-auto flex max-h-full w-[340px] flex-col overflow-hidden rounded-2xl">
      <div className="border-b border-white/5 px-4 py-3">
        <h2 className="eyebrow">Intelligence</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-fog-400">
          Describe an event. Gemini maps it onto MARTA stations, radius, and cascade effects, then the
          simulator runs.
        </p>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3 text-[12.5px] leading-relaxed">
        {error && <p className="mb-3 text-line-red">{error}</p>}
        {busy && (
          <div className="mb-3 flex items-center gap-2 text-fog-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the event…
          </div>
        )}
        {lastPrompt && (
          <div className="mb-3 rounded-xl bg-white/[0.04] px-3 py-2 text-[13px] text-fog-100">{lastPrompt}</div>
        )}
        {event ? (
          <div className="space-y-3 text-fog-300">
            <div>
              <div className="text-[13px] font-medium text-fog-100">{event.title}</div>
              <p className="mt-1">{narrative || event.summary}</p>
              <p className="mt-2 font-mono text-[11px] text-fog-500">
                {event.radiusKm.toFixed(1)} km radius · {event.stationImpacts.length} stations
              </p>
            </div>
            <ul className="space-y-1.5">
              {event.stationImpacts.map((impact) => (
                <li key={impact.stationId}>
                  <span className="text-fog-100">{impact.stationName}</span>
                  <span className="text-fog-500"> · {impact.effect}</span>
                  <div className="text-[11.5px] text-fog-500">{impact.reason}</div>
                </li>
              ))}
            </ul>
            {event.cascades.length > 0 && (
              <div>
                <div className="eyebrow mb-1">Cascades</div>
                <ul className="list-disc space-y-1 pl-4">
                  {event.cascades.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {event.recommendedRepairs.length > 0 && (
              <div>
                <div className="eyebrow mb-1">Repair first</div>
                <ul className="space-y-1">
                  {event.recommendedRepairs.map((item) => (
                    <li key={item.stationId}>
                      <span className="text-fog-100">{item.stationName}</span>
                      <div className="text-[11.5px] text-fog-500">{item.why}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {event.recommendedFacilities.length > 0 && (
              <div>
                <div className="eyebrow mb-1">Build next</div>
                <ul className="space-y-1">
                  {event.recommendedFacilities.map((item) => (
                    <li key={`${item.category}-${item.reason}`}>
                      <span className="text-fog-100">{item.category}</span>
                      <div className="text-[11.5px] text-fog-500">{item.reason}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {computing && <p className="text-fog-500">Updating access impacts on the map…</p>}
          </div>
        ) : (
          !busy && (
            <p className="text-fog-500">
              Try “earthquake near Midtown” or “festival on Peachtree and 10th”.
            </p>
          )
        )}
      </div>

      <form className="space-y-2 border-t border-white/5 p-3" onSubmit={generate}>
        <textarea
          value={prompt}
          onChange={(change) => setPrompt(change.target.value)}
          rows={4}
          placeholder="What happened in the city?"
          className="w-full resize-none rounded-xl border border-ink-600 bg-ink-900 px-3 py-2 text-[13px] text-fog-100 outline-none placeholder:text-fog-500 focus:border-signal"
        />
        <button
          type="submit"
          disabled={!prompt.trim() || busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-signal/15 px-3 py-2 text-[12.5px] font-medium text-signal-soft ring-1 ring-signal/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Generate
        </button>
      </form>
    </aside>
  )
}
