import { ArrowLeft, Check, Link2, Loader2, Trash2, X } from 'lucide-react'
import { useMemo } from 'react'
import { useBuildStore } from '@/store/buildStore'
import { useScenarioStore } from '@/store/scenarioStore'
import type { MartaLine, Station } from '@/types/network'
import { MARTA_LINES, MARTA_LINE_HEX } from '@/utils/constants'
import { haversineKm } from '@/utils/geo'
import { cn } from '@/utils/cn'

const FALLBACK_KM_PER_MINUTE = 0.55
const MIN_TRAVEL_MINUTES = 0.5

const INPUT =
  'w-full rounded-lg border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-[12.5px] text-fog-100 outline-none placeholder:text-fog-500 focus:border-signal disabled:opacity-50'
const LABEL = 'mb-1 block text-[11px] font-medium text-fog-400'

function titleCase(line: MartaLine): string {
  return line.charAt(0).toUpperCase() + line.slice(1)
}

/** Left-sidebar controls for the Build tab: place a stop, or remove the one you clicked. */
export function BuildSidebar() {
  const stations = useScenarioStore((state) => state.stations)
  const edges = useScenarioStore((state) => state.transitEdges)
  const loadStatus = useScenarioStore((state) => state.loadStatus)

  const pending = useBuildStore((state) => state.pending)
  const setCoordinate = useBuildStore((state) => state.setCoordinate)
  const stationName = useBuildStore((state) => state.stationName)
  const setStationName = useBuildStore((state) => state.setStationName)
  const line = useBuildStore((state) => state.line)
  const setLine = useBuildStore((state) => state.setLine)
  const extraLines = useBuildStore((state) => state.extraLines)
  const toggleExtraLine = useBuildStore((state) => state.toggleExtraLine)
  const neighborIds = useBuildStore((state) => state.neighborIds)
  const toggleNeighbor = useBuildStore((state) => state.toggleNeighbor)
  const setNeighborAt = useBuildStore((state) => state.setNeighborAt)
  const minutesOverride = useBuildStore((state) => state.minutesOverride)
  const setMinutesOverride = useBuildStore((state) => state.setMinutesOverride)
  const frequency = useBuildStore((state) => state.frequency)
  const setFrequency = useBuildStore((state) => state.setFrequency)
  const target = useBuildStore((state) => state.target)
  const selectTarget = useBuildStore((state) => state.selectTarget)
  const confirming = useBuildStore((state) => state.confirming)
  const setConfirming = useBuildStore((state) => state.setConfirming)
  const saving = useBuildStore((state) => state.saving)
  const submit = useBuildStore((state) => state.submit)
  const remove = useBuildStore((state) => state.remove)

  const stationById = useMemo(() => new Map(stations.map((item) => [item.id, item])), [stations])
  const sortedStations = useMemo(
    () => [...stations].sort((a, b) => a.name.localeCompare(b.name)),
    [stations],
  )

  const lineSpeed = useMemo(() => {
    let km = 0
    let minutes = 0
    for (const edge of edges) {
      if (edge.line !== line || edge.travelMinutes <= 0) continue
      const from = stationById.get(edge.fromStation)
      const to = stationById.get(edge.toStation)
      if (!from || !to) continue
      km += haversineKm(from, to)
      minutes += edge.travelMinutes
    }
    return minutes > 0 ? km / minutes : FALLBACK_KM_PER_MINUTE
  }, [edges, line, stationById])

  const lineFrequency = useMemo(() => {
    const onLine = edges.filter((edge) => edge.line === line)
    if (onLine.length === 0) return 12
    return onLine.reduce((sum, edge) => sum + edge.frequencyMinutes, 0) / onLine.length
  }, [edges, line])

  const estimateMinutes = (station: Station): number => {
    if (!pending) return 0
    const km = haversineKm(pending, station)
    return Math.max(MIN_TRAVEL_MINUTES, Math.round((km / lineSpeed) * 100) / 100)
  }

  const neighbors = neighborIds
    .map((id) => stationById.get(id))
    .filter((item): item is Station => Boolean(item))
  const replacesDirectHop =
    neighborIds.length === 2 &&
    edges.some(
      (edge) =>
        edge.line === line &&
        ((edge.fromStation === neighborIds[0] && edge.toStation === neighborIds[1]) ||
          (edge.fromStation === neighborIds[1] && edge.toStation === neighborIds[0])),
    )
  const offLineNeighbors = neighbors.filter((station) => !station.lines.includes(line))

  const targetLinks = useMemo(() => {
    if (!target) return []
    const byLine = new Map<MartaLine, Set<string>>()
    for (const edge of edges) {
      const other =
        edge.fromStation === target.id
          ? edge.toStation
          : edge.toStation === target.id
            ? edge.fromStation
            : null
      if (!other) continue
      if (!byLine.has(edge.line)) byLine.set(edge.line, new Set())
      byLine.get(edge.line)!.add(other)
    }
    return [...byLine.entries()].map(([edgeLine, ids]) => ({
      line: edgeLine,
      names: [...ids].map((id) => stationById.get(id)?.name ?? id),
    }))
  }, [edges, target, stationById])

  const canSave =
    loadStatus === 'ready' &&
    !saving &&
    Boolean(pending) &&
    stationName.trim().length > 0 &&
    neighborIds.length > 0
  const targetIsNeighbor = Boolean(target && neighborIds.includes(target.id))

  if (target) {
    return (
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="eyebrow">Selected</h2>
          <button
            type="button"
            onClick={() => selectTarget(null)}
            className="flex items-center gap-1 text-[11px] text-fog-400 hover:text-fog-100"
          >
            <ArrowLeft className="h-3 w-3" /> Back to adding
          </button>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/10">
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-medium">{target.name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-fog-500">
              <span className="flex gap-0.5">
                {target.lines.map((item) => (
                  <span key={item} className="h-1 w-3 rounded-full" style={{ background: MARTA_LINE_HEX[item] }} />
                ))}
              </span>
              Station · {target.id}
            </div>
          </div>

          <ul className="mt-2 space-y-0.5 text-[10.5px] text-fog-400">
            {targetLinks.length === 0 && <li>Not linked to any other station.</li>}
            {targetLinks.map((item) => (
              <li key={item.line} className="flex items-start gap-1.5">
                <span className="mt-1 h-1 w-3 shrink-0 rounded-full" style={{ background: MARTA_LINE_HEX[item.line] }} />
                <span>
                  {item.names.join(' · ')}
                  {item.names.length === 2 && <span className="text-fog-500"> — joined directly if removed</span>}
                  {item.names.length === 1 && <span className="text-fog-500"> — line would end there</span>}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-2.5 flex gap-1.5">
            {pending && (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  toggleNeighbor(target.id)
                  selectTarget(null)
                }}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] ring-1 disabled:opacity-40',
                  targetIsNeighbor
                    ? 'bg-signal/15 text-signal-soft ring-signal/40'
                    : 'text-fog-200 ring-white/10 hover:bg-white/5',
                )}
              >
                <Link2 className="h-3.5 w-3.5" />
                {targetIsNeighbor ? 'Disconnect from new stop' : 'Connect to new stop'}
              </button>
            )}
            {!confirming && (
              <button
                type="button"
                disabled={saving}
                onClick={() => setConfirming(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] text-shut ring-1 ring-shut/40 hover:bg-shut/10 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>

          {confirming && (
            <div className="mt-2 rounded-lg bg-shut/10 p-2 ring-1 ring-shut/30">
              <p className="text-[11px] leading-relaxed text-fog-200">
                Permanently deletes <span className="font-medium">{target.name}</span> from the shared database.
              </p>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void remove()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-shut/20 px-2 py-1.5 text-[11.5px] font-medium text-fog-100 ring-1 ring-shut/60 hover:bg-shut/30 disabled:opacity-40"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {saving ? 'Removing…' : 'Yes, remove'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setConfirming(false)}
                  className="rounded-lg px-2.5 py-1.5 text-[11.5px] text-fog-300 ring-1 ring-white/10 hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="text-[10.5px] text-fog-500">Click another station to switch, or click empty map to go back to adding.</p>
      </section>
    )
  }

  return (
    <section className="space-y-2">
      <h2 className="eyebrow">Build</h2>
      <p className="text-[11.5px] leading-relaxed text-fog-500">
        Click the map to drop a train stop, then drag it into place and connect it to existing stations.
        Saved permanently to the shared database.
      </p>

      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label className={LABEL} htmlFor="build-lat">Latitude</label>
          <input
            id="build-lat"
            className={cn(INPUT, 'font-mono')}
            type="number"
            step="0.0001"
            placeholder="click map"
            value={pending ? pending.latitude.toFixed(5) : ''}
            onChange={(event) => setCoordinate('latitude', Number(event.target.value))}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="build-lng">Longitude</label>
          <input
            id="build-lng"
            className={cn(INPUT, 'font-mono')}
            type="number"
            step="0.0001"
            placeholder="click map"
            value={pending ? pending.longitude.toFixed(5) : ''}
            onChange={(event) => setCoordinate('longitude', Number(event.target.value))}
          />
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="build-station-name">Station name</label>
        <input
          id="build-station-name"
          className={INPUT}
          placeholder="e.g. Emory University"
          value={stationName}
          onChange={(event) => setStationName(event.target.value)}
        />
      </div>

      <div>
        <div className={LABEL}>Line</div>
        <div className="grid grid-cols-4 gap-1">
          {MARTA_LINES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={line === value}
              onClick={() => setLine(value)}
              className={cn(
                'flex items-center justify-center gap-1 rounded-lg px-1.5 py-1 text-[11px] ring-1 transition-colors',
                line === value
                  ? 'bg-white/[0.08] text-fog-100 ring-white/20'
                  : 'text-fog-400 ring-white/5 hover:text-fog-100',
              )}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: MARTA_LINE_HEX[value] }} />
              {titleCase(value)}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-fog-500">
          <span>Also served by</span>
          {MARTA_LINES.filter((value) => value !== line).map((value) => (
            <label key={value} className="flex items-center gap-1">
              <input
                type="checkbox"
                className="accent-current"
                checked={extraLines.includes(value)}
                onChange={() => toggleExtraLine(value)}
              />
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: MARTA_LINE_HEX[value] }} />
              {titleCase(value)}
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className={LABEL}>Connects to</div>
        <div className="space-y-1.5">
          {[0, 1].map((index) => {
            const id = neighborIds[index] ?? ''
            const station = id ? stationById.get(id) : undefined
            return (
              <div key={index} className="rounded-lg bg-white/[0.03] p-1.5">
                <div className="flex items-center gap-1.5">
                  <select
                    className={INPUT}
                    value={id}
                    disabled={index === 1 && neighborIds.length === 0}
                    onChange={(event) => setNeighborAt(index, event.target.value)}
                  >
                    <option value="">{index === 0 ? 'Pick a station…' : 'Optional second station…'}</option>
                    {sortedStations.map((item) => (
                      <option
                        key={item.id}
                        value={item.id}
                        disabled={neighborIds.includes(item.id) && item.id !== id}
                      >
                        {item.name} · {item.lines.map(titleCase).join('/')}
                      </option>
                    ))}
                  </select>
                  {station && (
                    <button
                      type="button"
                      onClick={() => toggleNeighbor(station.id)}
                      className="rounded-md p-1 text-fog-500 hover:bg-white/5 hover:text-fog-100"
                      aria-label={`Disconnect ${station.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {station && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-fog-500">
                    <span className="shrink-0">Ride</span>
                    <input
                      className={cn(INPUT, 'w-16 py-0.5 font-mono text-[11.5px]')}
                      type="number"
                      min="0.1"
                      step="0.1"
                      placeholder={pending ? estimateMinutes(station).toFixed(1) : '—'}
                      value={minutesOverride[station.id] ?? ''}
                      onChange={(event) => setMinutesOverride(station.id, event.target.value)}
                    />
                    <span className="shrink-0">min</span>
                    {!minutesOverride[station.id] && pending && (
                      <span className="ml-auto truncate">estimated</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p className="mt-1 text-[10.5px] text-fog-500">Or click a station on the map and choose Connect.</p>
        {replacesDirectHop && (
          <p className="mt-1.5 text-[11px] text-fog-400">
            Trains will stop here between {neighbors[0]?.name} and {neighbors[1]?.name}; their direct hop is
            replaced.
          </p>
        )}
        {offLineNeighbors.length > 0 && (
          <p className="mt-1.5 text-[11px] text-maint">
            {offLineNeighbors.map((item) => item.name).join(' and ')}{' '}
            {offLineNeighbors.length === 1 ? "doesn't" : "don't"} currently serve the {titleCase(line)} line.
          </p>
        )}
      </div>

      <div>
        <label className={LABEL} htmlFor="build-frequency">Train every</label>
        <div className="flex items-center gap-2">
          <input
            id="build-frequency"
            className={cn(INPUT, 'w-20 font-mono')}
            type="number"
            min="1"
            step="0.5"
            placeholder={lineFrequency.toFixed(1)}
            value={frequency}
            onChange={(event) => setFrequency(event.target.value)}
          />
          <span className="text-[10.5px] text-fog-500">min · blank uses the line average</span>
        </div>
      </div>

      <button
        type="button"
        disabled={!canSave}
        onClick={() => void submit()}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-signal/15 px-3 py-1.5 text-[12px] font-medium text-signal-soft ring-1 ring-signal/30 hover:bg-signal/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        {saving ? 'Saving…' : 'Add station permanently'}
      </button>
      {!canSave && !saving && loadStatus === 'ready' && (
        <p className="text-[10.5px] text-fog-500">
          {!pending
            ? 'Place it on the map first.'
            : !stationName.trim()
              ? 'Give the station a name.'
              : 'Connect it to at least one existing station.'}
        </p>
      )}
    </section>
  )
}
