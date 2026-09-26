import { Download, Lightbulb, Plus, Sparkles, X } from 'lucide-react'
import { useScenarioStore } from '@/store/scenarioStore'
import { SERVICE_CATEGORIES, categoryMeta } from '@/utils/categories'
import { cn } from '@/utils/cn'
import { hex } from '@/utils/constants'
import {
  CIP_BUDGET_MAX,
  CIP_BUDGET_MIN,
  CIP_SECTORS,
  budgetFromSlider,
  cheapestFacilityCost,
  formatBudgetMillions,
  formatUsd,
  sectorMeta,
  sliderFromBudget,
} from '@/utils/facilityCosts'

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

function CapitalProgram() {
  const budget = useScenarioStore((state) => state.cipBudget)
  const setBudget = useScenarioStore((state) => state.setCipBudget)
  const sector = useScenarioStore((state) => state.cipSector)
  const setSector = useScenarioStore((state) => state.setCipSector)
  const optimizeLowIncome = useScenarioStore((state) => state.cipOptimizeLowIncome)
  const setOptimizeLowIncome = useScenarioStore((state) => state.setCipOptimizeLowIncome)
  const generate = useScenarioStore((state) => state.generateCipPlan)
  const download = useScenarioStore((state) => state.downloadCip)
  const plan = useScenarioStore((state) => state.cipPlan)
  const status = useScenarioStore((state) => state.cipStatus)
  const computing = useScenarioStore((state) => state.computing)
  const slider = sliderFromBudget(budget)
  const focus = sectorMeta(sector)

  return (
    <div className="space-y-2.5 rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-emerald-400/20">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[12px] font-medium text-fog-100">Capital budget</h3>
        <span className="font-mono text-[12px] tabular-nums text-emerald-300">{formatBudgetMillions(budget)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1000}
        step={1}
        value={Math.round(slider * 1000)}
        onChange={(event) => setBudget(budgetFromSlider(Number(event.target.value) / 1000))}
        className="w-full accent-emerald-400"
        aria-label="Capital improvement budget"
      />
      <div className="flex justify-between font-mono text-[10px] text-fog-500">
        <span>{formatBudgetMillions(CIP_BUDGET_MIN)}</span>
        <span>{formatBudgetMillions(CIP_BUDGET_MAX)}</span>
      </div>
      <div>
        <div className="mb-1 text-[11px] text-fog-400">Sector</div>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Capital plan sector">
          {CIP_SECTORS.map((item) => {
            const active = item.id === sector
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSector(item.id)}
                className={cn(
                  'rounded-lg px-2 py-1 text-[11px] ring-1 transition-colors',
                  active
                    ? 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40'
                    : 'text-fog-400 ring-white/10 hover:bg-white/[0.04] hover:text-fog-100',
                )}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>
      <button
        type="button"
        aria-pressed={optimizeLowIncome}
        onClick={() => setOptimizeLowIncome(!optimizeLowIncome)}
        className={cn(
          'w-full rounded-lg px-2 py-1.5 text-left text-[11px] ring-1 transition-colors',
          optimizeLowIncome
            ? 'bg-line-gold/20 text-line-gold ring-line-gold/50'
            : 'text-fog-400 ring-white/10 hover:bg-white/[0.04] hover:text-fog-100',
        )}
      >
        Optimize for low income?
      </button>
      <p className="text-[11px] leading-relaxed text-fog-500">
        {focus.brief}. Lowest-cost site in this sector is about {formatUsd(cheapestFacilityCost(sector))}.
      </p>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={generate}
          disabled={computing}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 px-2 py-1.5 text-[12px] text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {computing ? 'Optimizing…' : 'Build plan'}
        </button>
        <button
          type="button"
          onClick={download}
          disabled={!plan || plan.projects.length === 0 || computing}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/[0.04] px-2 py-1.5 text-[12px] text-fog-100 ring-1 ring-white/10 hover:bg-white/[0.08] disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" />
          Download CIP
        </button>
      </div>
      {plan && plan.projects.length > 0 && (
        <p className="text-[11px] leading-relaxed text-fog-400">
          {plan.projects.length} site{plan.projects.length === 1 ? '' : 's'} · {plan.sectorLabel}
          {plan.optimizeForLowIncome ? ' · low-income' : ''} · {formatUsd(plan.spent)} committed ·{' '}
          {formatUsd(plan.leftover)} left
        </p>
      )}
      {status && <p className="text-[11px] leading-relaxed text-amber-200/90">{status}</p>}
    </div>
  )
}

export function AddInfrastructure() {
  const addedPois = useScenarioStore((state) => state.addedPois)
  const addPoi = useScenarioStore((state) => state.addPoi)
  const placeOptimalPoi = useScenarioStore((state) => state.placeOptimalPoi)

  return (
    <div className="space-y-3">
      <CapitalProgram />
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
          Build a budgeted package (this replaces dropped sites), or place one: plus at map center, bulb for 15+ minute
          savings.
        </p>
      )}
    </div>
  )
}
