import { cn } from '@/lib/utils'
import type { ServiceState } from '@/lib/api'

const SERVICE_PORTS: Record<string, number> = {
  users: 5001,
  products: 5002,
  products_replica: 5012,
  orders: 5003,
}

interface Props {
  name: string
  state: ServiceState
}

export function ServiceCard({ name, state }: Props) {
  const port = SERVICE_PORTS[name] ?? 0
  const label = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className={cn(
      'rounded-xl border p-4 flex flex-col gap-2 transition-colors',
      state.up ? 'border-green-500/40 bg-green-950/20' : 'border-red-500/40 bg-red-950/20',
    )}>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm text-white">{label}</span>
        <span className={cn(
          'text-xs px-2 py-0.5 rounded-full font-medium',
          state.up ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400',
        )}>
          {state.up ? 'UP' : 'DOWN'}
        </span>
      </div>
      <p className="text-xs text-zinc-400">Port {port}</p>
      {state.latency_ms !== null && (
        <p className="text-xs text-zinc-400">{state.latency_ms} ms</p>
      )}
      {state.last_ping && (
        <p className="text-xs text-zinc-500 truncate">
          {new Date(state.last_ping).toLocaleTimeString()}
        </p>
      )}
    </div>
  )
}
