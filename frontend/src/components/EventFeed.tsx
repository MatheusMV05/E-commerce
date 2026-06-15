import { cn } from '@/lib/utils'
import type { LogEntry } from '@/lib/api'

interface Props { logs: LogEntry[] }

export function EventFeed({ logs }: Props) {
  const recent = logs.slice(0, 8)
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 h-full">
      <h3 className="text-sm font-semibold text-white mb-3">Recent Events</h3>
      {recent.length === 0 ? (
        <p className="text-xs text-zinc-500">No events yet. Heartbeat runs every 5 s.</p>
      ) : (
        <ul className="space-y-2">
          {recent.map((entry, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span className={cn(
                'mt-0.5 w-2 h-2 rounded-full flex-shrink-0',
                entry.status === 'UP' ? 'bg-green-400' : 'bg-red-400',
              )} />
              <div>
                <span className="text-zinc-300 font-medium">
                  {entry.service.replace(/_/g, ' ')}
                </span>
                <span className={cn(
                  'ml-1',
                  entry.status === 'UP' ? 'text-green-400' : 'text-red-400',
                )}>
                  {entry.status}
                </span>
                {entry.note && (
                  <span className="ml-1 text-zinc-500">({entry.note})</span>
                )}
                <p className="text-zinc-600">{new Date(entry.timestamp).toLocaleTimeString()}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
