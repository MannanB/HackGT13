import { Loader2, Sparkles } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { interpretEvent } from '@/services/intelligenceService'
import { describeScenario, useScenarioStore } from '@/store/scenarioStore'

export function IntelligencePanel() {
  const stations = useScenarioStore((state) => state.stations)
  const event = useScenarioStore((state) => state.intelEvent)
  const narrative = useScenarioStore((state) => state.intelNarrative)
  const applyIntelEvent = useScenarioStore((state) => state.applyIntelEvent)
  const computing = useScenarioStore((state) => state.computing)
  const clearIntelEvent = useScenarioStore((state) => state.clearIntelEvent)
  const evacuation = useScenarioStore((state) => state.evacuation)
  const destroyedPoiIds = useScenarioStore((state) => state.destroyedPoiIds)
  const pois = useScenarioStore((state) => state.pois)
  const disruptionResult = useScenarioStore((state) => state.disruptionResult)
  const evacuationSummary = disruptionResult?.evacuation
  const fullHospitals = (disruptionResult?.hospitalCapacity ?? []).filter(
    (item) => item.loadRatio != null && item.loadRatio >= 1,
  ).length
  const destroyedNames = useMemo(
    () => pois.filter((poi) => destroyedPoiIds[poi.id]),
    [pois, destroyedPoiIds],
  )
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const setStationState = useScenarioStore((state) => state.setStationState)
  const togglePoiClosed = useScenarioStore((state) => state.togglePoiClosed)
  const generate = async (form: FormEvent) => {
    form.preventDefault()
    const next = prompt.trim()
    if (!next || busy) return
    setBusy(true)
    setError(null)
    setHistory((items) => [...items, next])
    setPrompt('')
    try {
      const result = await interpretEvent(next, stations, describeScenario(useScenarioStore.getState()))
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
          Describe an event. AI maps it onto MARTA stations, radius, and cascade effects, then the
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
        {history.map((item, index) => (
          <div
            key={`${index}-${item}`}
            className={`mb-2 rounded-xl bg-white/[0.04] px-3 py-2 text-[13px] ${
              index === history.length - 1 ? 'text-fog-100' : 'text-fog-500'
            }`}
          >
            {item}
          </div>
        ))}
        {event ? (
          <div className="space-y-3 text-fog-300">
            <div>
              <div className="text-[13px] font-medium text-fog-100">{event.title}</div>
              <p className="mt-1">{narrative || event.summary}</p>
              <p className="mt-2 font-mono text-[11px] text-fog-500">
                {event.radiusKm.toFixed(1)} km radius · {event.stationImpacts.length} stations
              </p>
              <p className="mt-1 text-[11px] text-fog-500">
                Synced with the Disrupt tab. Follow-ups like “reopen Five Points” or “make it worse” build on the
                current state.
              </p>
            </div>
            {(evacuation || destroyedNames.length > 0) && (
              <div className="rounded-xl bg-line-red/10 px-3 py-2 ring-1 ring-line-red/30">
                <div className="flex items-center justify-between">
                  <div className="eyebrow text-line-red">
                    {evacuation ? `Evacuation · severity ${evacuation.severity}/5` : 'Structural damage'}
                  </div>
                  <button
                    type="button"
                    onClick={clearIntelEvent}
                    className="rounded-md px-2 py-0.5 text-[11px] text-fog-300 ring-1 ring-white/10 hover:text-fog-100"
                  >
                    End
                  </button>
                </div>
                <ul className="mt-1.5 space-y-1 text-[12px]">
                  {evacuationSummary && (
                    <>
                      <li>
                        <span className="text-fog-100">
                          {Math.round(evacuationSummary.evacuatingResidents).toLocaleString()}
                        </span>{' '}
                        residents evacuating toward the outskirts; roads and stations on the zone edge are congested.
                      </li>
                      <li>
                        <span className="text-fog-100">
                          {Math.round(evacuationSummary.surgeAdmissions).toLocaleString()}
                        </span>{' '}
                        injured need hospital beds over the first 6 hours.
                      </li>
                    </>
                  )}
                  {fullHospitals > 0 && (
                    <li>
                      <span className="text-fog-100">{fullHospitals}</span> hospitals projected over capacity.
                    </li>
                  )}
                  {destroyedNames.length > 0 && (
                    <li>
                      <span className="text-fog-100">{destroyedNames.length}</span> destinations destroyed:
                      <ul className="mt-1 space-y-0.5">
                        {destroyedNames.slice(0, 8).map((poi) => (
                          <li key={poi.id} className="flex items-center justify-between gap-2 text-fog-500">
                            <span className="truncate">{poi.name}</span>
                            <button
                              type="button"
                              onClick={() => togglePoiClosed(poi.id)}
                              className="shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] text-fog-400 ring-1 ring-white/10 hover:text-fog-100"
                            >
                              Rebuild
                            </button>
                          </li>
                        ))}
                        {destroyedNames.length > 8 && (
                          <li className="text-fog-500">+{destroyedNames.length - 8} more</li>
                        )}
                      </ul>
                    </li>
                  )}
                </ul>
              </div>
            )}
            <ul className="space-y-1.5">
              {event.stationImpacts.map((impact) => (
                <li key={impact.stationId}>
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      <span className="text-fog-100">{impact.stationName}</span>
                      <span className="text-fog-500"> · {impact.effect}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setStationState(impact.stationId, 'normal')}
                      className="rounded-md px-1.5 py-0.5 text-[10.5px] text-fog-400 ring-1 ring-white/10 hover:text-fog-100"
                    >
                      Restore
                    </button>
                  </div>
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
              Try “NBA game at Mercedes-Benz Stadium” or “flash floods around east point”.
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
