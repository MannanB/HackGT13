import { ArrowRight, LoaderCircle, Play } from 'lucide-react'
import { useScenarioStore } from '@/store/scenarioStore'
import { Button } from '@/components/ui/Button'

export function SimulationButton() {
  const runSimulation = useScenarioStore((state) => state.runSimulation)
  const status = useScenarioStore((state) => state.simulationStatus)
  const loading = status === 'loading'

  return (
    <Button
      size="lg"
      className="w-full justify-between rounded-2xl bg-signal text-sm font-semibold shadow-[0_0_0_1px_rgba(59,130,246,0.35)]"
      onClick={() => void runSimulation()}
      disabled={loading}
    >
      <span className="flex items-center gap-2">
        {loading ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4 fill-current" />
        )}
        {loading ? 'Recomputing access…' : 'Run Simulation'}
      </span>
      <ArrowRight className="h-4 w-4" />
    </Button>
  )
}
