import { Plus, X } from 'lucide-react'
import { useScenarioStore } from '@/store/scenarioStore'
import { SERVICE_CATEGORIES, categoryMeta } from '@/utils/categories'
import { hex } from '@/utils/constants'

export function AddInfrastructure() {
  const addedPois = useScenarioStore((state) => state.addedPois)
  const addPoi = useScenarioStore((state) => state.addPoi)
  const removePoi = useScenarioStore((state) => state.removePoi)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        {SERVICE_CATEGORIES.map(({ category, label, icon: Icon, rgb }) => (
          <button
            key={category}
            type="button"
            onClick={() => addPoi(category, label.replace(/s$/, '').replace(/ie$/, 'y'))}
            className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-2.5 py-2 text-left text-[12.5px] text-fog-100 ring-1 ring-white/5 transition-colors hover:bg-white/[0.07]"
          >
            <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: hex(rgb) }} />
            <span className="truncate">{label}</span>
            <Plus className="ml-auto h-3 w-3 text-fog-500" />
          </button>
        ))}
      </div>

      {addedPois.length > 0 ? (
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
      ) : (
        <p className="text-[12px] text-fog-500">Pick a type to drop it at the map center, then drag it.</p>
      )}
    </div>
  )
}
