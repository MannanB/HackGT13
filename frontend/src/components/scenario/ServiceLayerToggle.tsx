import {
  BookOpen,
  Building2,
  Cross,
  GraduationCap,
  Landmark,
  Stethoscope,
  UtensilsCrossed,
} from 'lucide-react'
import { useScenarioStore } from '@/store/scenarioStore'
import { cn } from '@/utils/cn'
import type { PoiCategory } from '@/types/geography'

const services: {
  category: PoiCategory
  label: string
  icon: typeof Cross
}[] = [
  { category: 'hospital', label: 'Hospital', icon: Cross },
  { category: 'clinic', label: 'Clinic', icon: Stethoscope },
  { category: 'school', label: 'School', icon: GraduationCap },
  { category: 'government', label: 'Government', icon: Landmark },
  { category: 'university', label: 'University', icon: Building2 },
  { category: 'grocery', label: 'Grocery', icon: UtensilsCrossed },
  { category: 'library', label: 'Library', icon: BookOpen },
]

const ICON_TONE: Partial<Record<PoiCategory, string>> = {
  hospital: 'bg-line-red/15 text-line-red',
  clinic: 'bg-line-red/10 text-line-red',
  grocery: 'bg-line-green/15 text-line-green',
  government: 'bg-signal/15 text-signal-soft',
  school: 'bg-line-gold/15 text-line-gold',
  university: 'bg-line-gold/10 text-line-gold',
  library: 'bg-ink-700 text-fog-300',
}

export function ServiceLayerToggle() {
  const selected = useScenarioStore((state) => state.selectedServiceCategories)
  const toggle = useScenarioStore((state) => state.toggleServiceCategory)
  const pois = useScenarioStore((state) => state.pois)

  return (
    <div className="space-y-1">
      {services.map((service) => {
        const Icon = service.icon
        const checked = selected.includes(service.category)
        const count = pois.filter((poi) => poi.category === service.category).length
        return (
          <label
            key={service.category}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-ink-850/80 px-2 py-1.5"
          >
            <input
              type="checkbox"
              className="peer sr-only"
              checked={checked}
              onChange={() => toggle(service.category)}
            />
            <span
              className={cn(
                'flex h-3.5 w-3.5 items-center justify-center rounded border',
                checked ? 'border-signal bg-signal text-white' : 'border-ink-500 bg-ink-900',
              )}
            >
              {checked && (
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
                  <path
                    d="M2.5 6.2 4.8 8.5 9.5 3.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </span>
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-md',
                ICON_TONE[service.category] ?? 'bg-ink-700 text-fog-400',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className={cn('text-sm', checked ? 'text-fog-100' : 'text-fog-400')}>
              {service.label}
            </span>
            {count > 0 && (
              <span className="ml-auto text-[10px] tabular-nums text-fog-400">{count}</span>
            )}
          </label>
        )
      })}
    </div>
  )
}
