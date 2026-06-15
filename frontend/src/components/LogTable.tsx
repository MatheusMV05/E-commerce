import { cn } from '@/lib/utils'
import type { LogEntry } from '@/lib/api'

interface Props { logs: LogEntry[] }

export function LogTable({ logs }: Props) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h3 className="text-sm font-semibold text-white">Event Log</h3>
        <p className="text-xs text-zinc-500">{logs.length} events recorded</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="text-left px-4 py-2">Timestamp</th>
              <th className="text-left px-4 py-2">Service</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-600">
                  No events yet
                </td>
              </tr>
            ) : logs.map((entry, i) => (
              <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                <td className="px-4 py-2 text-zinc-400 whitespace-nowrap">
                  {new Date(entry.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-zinc-300 capitalize">
                  {entry.service.replace(/_/g, ' ')}
                </td>
                <td className="px-4 py-2">
                  <span className={cn(
                    'px-2 py-0.5 rounded-full font-medium',
                    entry.status === 'UP'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400',
                  )}>
                    {entry.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-zinc-500">{entry.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
