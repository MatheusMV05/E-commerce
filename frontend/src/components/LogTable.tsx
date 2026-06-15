import { cn } from '@/lib/utils'
import type { UnifiedEntry } from '@/lib/api'

interface Props { entries: UnifiedEntry[] }

function statusBadge(entry: UnifiedEntry) {
  if (entry.kind === 'heartbeat') {
    const up = entry.status === 'UP'
    return (
      <span className={cn('px-2 py-0.5 rounded-full font-medium',
        up ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400')}>
        {entry.status}
      </span>
    )
  }
  const s = entry.status
  const cls =
    s === 0   ? 'bg-zinc-700 text-zinc-400'
    : s < 300 ? 'bg-green-500/20 text-green-400'
    : s < 400 ? 'bg-blue-500/20 text-blue-400'
    : s < 500 ? 'bg-yellow-500/20 text-yellow-400'
    :           'bg-red-500/20 text-red-400'
  return (
    <span className={cn('px-2 py-0.5 rounded-full font-medium', cls)}>
      {s === 0 ? 'ERR' : s}
    </span>
  )
}

export function LogTable({ entries }: Props) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h3 className="text-sm font-semibold text-white">Event Log</h3>
        <p className="text-xs text-zinc-500">{entries.length} events recorded</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="text-left px-4 py-2">Time</th>
              <th className="text-left px-4 py-2">Type</th>
              <th className="text-left px-4 py-2">Target</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-600">
                  No events yet
                </td>
              </tr>
            ) : entries.map((entry, i) => (
              <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                <td className="px-4 py-2 text-zinc-400 whitespace-nowrap">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </td>
                <td className="px-4 py-2">
                  <span className={cn('px-1.5 py-0.5 rounded text-zinc-400 font-mono',
                    entry.kind === 'request' ? 'bg-zinc-800' : 'bg-zinc-800/50')}>
                    {entry.kind === 'request' ? entry.method : 'heartbeat'}
                  </span>
                </td>
                <td className="px-4 py-2 text-zinc-300 font-mono">
                  {entry.kind === 'request'
                    ? entry.path
                    : entry.service.replace(/_/g, ' ')}
                </td>
                <td className="px-4 py-2">{statusBadge(entry)}</td>
                <td className="px-4 py-2 text-zinc-500">
                  {entry.kind === 'heartbeat' ? (entry.note || '—') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
