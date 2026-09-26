import { buildMockSimulation } from '@/data/mockScenarios'
import { endpoints, mockRequest } from '@/services/api'
import type {
  SimulateScenarioRequest,
  SimulationResult,
  TraceImpact,
  TraceImpactRequest,
} from '@/types/simulation'

let lastResult: SimulationResult | null = null

export async function simulateScenario(
  request: SimulateScenarioRequest,
): Promise<SimulationResult> {
  void endpoints.simulate
  const result = buildMockSimulation(request)
  lastResult = result
  const wait = 650 + Math.round(Math.random() * 280)
  return mockRequest(result, wait)
}

export async function getScenario(scenarioId: string): Promise<SimulationResult> {
  void endpoints.scenario(scenarioId)
  if (!lastResult || lastResult.scenario.id !== scenarioId) {
    throw new Error('Scenario not found')
  }
  return mockRequest(lastResult, 80)
}

export async function getScenarioImpacts(scenarioId: string) {
  void endpoints.impacts(scenarioId)
  const scenario = await getScenario(scenarioId)
  return scenario.zoneImpacts
}

export async function getTraceImpact(request: TraceImpactRequest): Promise<TraceImpact> {
  void endpoints.trace(request.scenarioId)
  if (!lastResult || lastResult.scenario.id !== request.scenarioId) {
    throw new Error('Scenario not found')
  }
  const trace = lastResult.traces[request.zoneId]
  if (!trace) {
    throw new Error('Trace not found')
  }
  return mockRequest(trace, 160)
}
