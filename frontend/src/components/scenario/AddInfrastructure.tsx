import { Lightbulb, Plus, X } from 'lucide-react'
import { useScenarioStore } from '@/store/scenarioStore'
import { SERVICE_CATEGORIES, categoryMeta } from '@/utils/categories'
import { hex } from '@/utils/constants'

function typeLabel(label: string) {
  return label.replace(/s$/, '').replace(/ie$/, 'y')
}

export function PlacedPoiList() {
  const addedPois = useScenarioStore((state) => state.addedPois)
  const removePoi = useScenarioStore((state) => state.removePoi)
  if (addedPois.length === 0) return null
  return (
    <ul className="space-y-1">
      {addedPois.map((poi) => {
        const meta = categoryMeta(poi.category)
        const Icon = meta?.icon
        return (
          <li
            key={poi.id}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-fog-100 ring-1 ring-emerald-400/25"
          >
            {Icon && <Icon className="h-3.5 w-3.5" style={{ color: meta && hex(meta.rgb) }} />}
            <span className="truncate">{poi.name}</span>
            <button
              type="button"
              onClick={() => removePoi(poi.id)}
              className="ml-auto rounded p-0.5 text-fog-500 hover:bg-white/5 hover:text-fog-100"
              aria-label={`Remove ${poi.name}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function AddInfrastructure() {
  const addedPois = useScenarioStore((state) => state.addedPois)
  const addPoi = useScenarioStore((state) => state.addPoi)
  const placeOptimalPoi = useScenarioStore((state) => state.placeOptimalPoi)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        {SERVICE_CATEGORIES.map(({ category, label, icon: Icon, rgb }) => (
          <div
            key={category}
            className="flex items-center gap-0.5 rounded-xl bg-white/[0.03] py-1 pl-2.5 pr-1 ring-1 ring-white/5"
          >
            <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: hex(rgb) }} />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-fog-100">{label}</span>
            <button
              type="button"
              onClick={() => placeOptimalPoi(category, typeLabel(label))}
              className="rounded-lg p-1.5 text-fog-500 transition-colors hover:bg-white/[0.08] hover:text-emerald-300"
              aria-label={`Place ${label} at the best location`}
              title="Place where it helps the most regions"
            >
              <Lightbulb className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => addPoi(category, typeLabel(label))}
              className="rounded-lg p-1.5 text-fog-500 transition-colors hover:bg-white/[0.08] hover:text-fog-100"
              aria-label={`Add ${label} at map center`}
              title="Drop at map center"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {addedPois.length > 0 ? (
        <PlacedPoiList />
      ) : (
        <p className="text-[12px] text-fog-500">
          Plus drops at the map center. The bulb places it where at least 15 minutes are saved for the most
          regions, then drag to refine.
        </p>
      )}
    </div>
  )
}
