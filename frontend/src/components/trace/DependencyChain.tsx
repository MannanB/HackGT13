import { Building2, House, Train, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { PathNode, RoutePath } from '@/types/simulation'

export function DependencyChain({
  path,
  label,
  failedStationIds,
}: {
  path: RoutePath
  label: string
  failedStationIds: string[]
}) {
  return (
    <div>
      <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-fog-400">{label}</div>
      <ol className="relative space-y-2">
        {path.nodes.map((node, index) => (
          <ChainNode
            key={`${node.type}-${node.id}-${index}`}
            node={node}
            failed={Boolean(node.failed) || failedStationIds.includes(node.id)}
            last={index === path.nodes.length - 1}
          />
        ))}
      </ol>
    </div>
  )
}

function ChainNode({
  node,
  failed,
  last,
}: {
  node: PathNode
  failed: boolean
  last: boolean
}) {
  const Icon = iconFor(node)
  return (
    <li className="relative flex gap-3">
      {!last && (
        <span className="absolute left-[15px] top-8 h-[calc(100%-8px)] w-px bg-ink-600" />
      )}
      <span
        className={cn(
          'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          failed ? 'bg-line-red/20 text-line-red' : 'bg-ink-700 text-fog-300',
        )}
      >
        {failed ? <X className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1 rounded-xl border border-ink-700 bg-ink-850 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-fog-100">{labelFor(node)}</span>
          {failed && (
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-line-red">
              Service down
            </span>
          )}
        </div>
        <div className="text-[11px] text-fog-400">{captionFor(node)}</div>
      </div>
    </li>
  )
}

function iconFor(node: PathNode) {
  if (node.type === 'zone') return House
  if (node.type === 'poi') return Building2
  return Train
}

function labelFor(node: PathNode) {
  if (node.type === 'station' && !node.name.toLowerCase().includes('station')) {
    return `${node.name} Station`
  }
  return node.name
}

function captionFor(node: PathNode) {
  if (node.type === 'zone') return 'Neighborhood'
  if (node.type === 'poi') {
    if (node.name.toLowerCase().includes('hospital')) return 'Hospital'
    if (node.name.toLowerCase().includes('kroger') || node.name.toLowerCase().includes('publix') || node.name.toLowerCase().includes('market')) {
      return 'Grocery'
    }
    return 'Essential service'
  }
  if (node.failed) return 'MARTA Station (Offline)'
  return 'MARTA Station'
}
