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
  description: string
  icon: typeof Cross
}[] = [
  {
    category: 'hospital',
    label: 'Hospital',
    description: 'Emergency and inpatient care',
    icon: Cross,
  },
  {
    category: 'clinic',
    label: 'Clinic',
    description: 'Clinics and outpatient care',
    icon: Stethoscope,
  },
  {
    category: 'grocery',
    label: 'Grocery',
    description: 'Supermarkets and food stores',
    icon: UtensilsCrossed,
  },
  {
    category: 'government',
    label: 'Government',
    description: 'Civic buildings and services',
    icon: Landmark,
  },
  {
    category: 'school',
    label: 'School',
    description: 'K–12 schools',
    icon: GraduationCap,
  },
  {
    category: 'university',
    label: 'University',
    description: 'Colleges and universities',
    icon: Building2,
  },
  {
    category: 'library',
    label: 'Library',
    description: 'Public libraries',
    icon: BookOpen,
  },
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
    <div className="space-y-1.5">
      {services.map((service) => {
        const Icon = service.icon
        const checked = selected.includes(service.category)
        const count = pois.filter((poi) => poi.category === service.category).length
        return (
          <label
            key={service.category}
            className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink-800"
          >
            <input
              type="checkbox"
              className="peer sr-only"
              checked={checked}
              onChange={() => toggle(service.category)}
            />
            <span
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded border',
                checked ? 'border-signal bg-signal text-white' : 'border-ink-500 bg-ink-850',
              )}
            >
              {checked && (
                <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
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
                'flex h-8 w-8 items-center justify-center rounded-lg',
                ICON_TONE[service.category] ?? 'bg-ink-700 text-fog-400',
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm text-fog-100">{service.label}</span>
                {count > 0 && (
                  <span className="text-[11px] tabular-nums text-fog-400">{count}</span>
                )}
              </span>
              <span className="block text-[11px] text-fog-400">{service.description}</span>
            </span>
          </label>
        )
      })}
    </div>
  )
}
