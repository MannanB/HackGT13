import { Briefcase, Cross, GraduationCap, Pill, Tent, UtensilsCrossed } from 'lucide-react'
import { useScenarioStore } from '@/store/scenarioStore'
import { cn } from '@/utils/cn'
import type { PoiCategory } from '@/types/geography'

const services: {
  category: PoiCategory
  label: string
  description: string
  icon: typeof Cross
  enabled: boolean
}[] = [
  {
    category: 'hospital',
    label: 'Healthcare',
    description: 'Hospitals, urgent care, clinics',
    icon: Cross,
    enabled: true,
  },
  {
    category: 'grocery',
    label: 'Food',
    description: 'Grocery stores, food banks',
    icon: UtensilsCrossed,
    enabled: true,
  },
  {
    category: 'pharmacy',
    label: 'Pharmacy',
    description: 'Pharmacies, medication access',
    icon: Pill,
    enabled: true,
  },
  {
    category: 'school',
    label: 'Schools',
    description: 'Coming later',
    icon: GraduationCap,
    enabled: false,
  },
  {
    category: 'employment',
    label: 'Jobs',
    description: 'Coming later',
    icon: Briefcase,
    enabled: false,
  },
]

const futureShelters = {
  label: 'Shelter',
  description: 'Coming later',
  icon: Tent,
}

export function ServiceLayerToggle() {
  const selected = useScenarioStore((state) => state.selectedServiceCategories)
  const toggle = useScenarioStore((state) => state.toggleServiceCategory)

  return (
    <div className="space-y-1.5">
      {services.map((service) => {
        const Icon = service.icon
        const checked = selected.includes(service.category)
        return (
          <label
            key={service.category}
            className={cn(
              'flex items-center gap-3 rounded-xl px-2 py-2',
              service.enabled ? 'cursor-pointer hover:bg-ink-800' : 'opacity-40',
            )}
          >
            <input
              type="checkbox"
              className="peer sr-only"
              checked={checked && service.enabled}
              disabled={!service.enabled}
              onChange={() => service.enabled && toggle(service.category)}
            />
            <span
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded border',
                checked && service.enabled
                  ? 'border-signal bg-signal text-white'
                  : 'border-ink-500 bg-ink-850',
              )}
            >
              {checked && service.enabled && (
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
                service.category === 'hospital' && 'bg-line-red/15 text-line-red',
                service.category === 'grocery' && 'bg-line-green/15 text-line-green',
                service.category === 'pharmacy' && 'bg-signal/15 text-signal-soft',
                !service.enabled && 'bg-ink-700 text-fog-400',
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm text-fog-100">{service.label}</span>
              <span className="block text-[11px] text-fog-400">{service.description}</span>
            </span>
          </label>
        )
      })}
      <div className="flex items-center gap-3 rounded-xl px-2 py-2 opacity-40">
        <span className="flex h-4 w-4 rounded border border-ink-500 bg-ink-850" />
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-700 text-fog-400">
          <futureShelters.icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm text-fog-100">{futureShelters.label}</span>
          <span className="block text-[11px] text-fog-400">{futureShelters.description}</span>
        </span>
      </div>
    </div>
  )
}
