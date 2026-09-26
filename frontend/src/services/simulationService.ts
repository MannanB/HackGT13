import { buildAccessSimulation } from '@/services/accessSimulator'
import type {
  SimulationResult,
  SimulateScenarioRequest,
  TraceImpact,
  TraceImpactRequest,
} from '@/types/simulation'

let lastResult: SimulationResult | null = null

export async function simulateScenario(
  request: SimulateScenarioRequest,
): Promise<SimulationResult> {
  await new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
  const result = buildAccessSimulation(request)
  lastResult = result
  return result
}

export async function getScenario(scenarioId: string): Promise<SimulationResult> {
  if (!lastResult || lastResult.scenario.id !== scenarioId) {
    throw new Error('Scenario not found')
  }
  return lastResult
}

export async function getScenarioImpacts(scenarioId: string) {
  const scenario = await getScenario(scenarioId)
  return scenario.zoneImpacts
}

export async function getTraceImpact(request: TraceImpactRequest): Promise<TraceImpact> {
  if (!lastResult || lastResult.scenario.id !== request.scenarioId) {
    throw new Error('Scenario not found')
  }
  const trace = lastResult.traces[request.zoneId]
  if (!trace) throw new Error('Trace not found')
  return trace
}
