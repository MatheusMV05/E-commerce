import { useEffect, useState, useCallback } from 'react'
import { fetchStatus, fetchLogs } from './lib/api'
import type { HealthStatus, LogEntry } from './lib/api'
import { ServiceCard } from './components/ServiceCard'
import { EventFeed } from './components/EventFeed'
import { LogTable } from './components/LogTable'

export default function App() {
  const [status, setStatus] = useState<HealthStatus | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([fetchStatus(), fetchLogs()])
      setStatus(s)
      setLogs(l.logs)
      setLastUpdate(new Date())
      setError(null)
    } catch {
      setError('Cannot reach gateway at ' + ((import.meta.env.VITE_GATEWAY_URL as string) ?? 'http://localhost:8000'))
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">E-commerce Monitor</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Microservices heartbeat dashboard — polling every 3 s
            </p>
          </div>
          <div className="text-right">
            {lastUpdate && (
              <p className="text-xs text-zinc-500">
                Updated {lastUpdate.toLocaleTimeString()}
              </p>
            )}
            <button
              onClick={refresh}
              className="mt-1 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              Refresh ↻
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-950/20 px-4 py-3 text-sm text-red-400">
            ⚠ {error}
          </div>
        )}

        {status && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(status.services).map(([name, state]) => (
              <ServiceCard key={name} name={name} state={state} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <EventFeed logs={logs} />
          </div>
          <div className="md:col-span-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 h-full">
              <h3 className="text-sm font-semibold text-white mb-3">Event Stats</h3>
              {logs.length === 0 ? (
                <p className="text-xs text-zinc-500">No events recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-6">
                    <div>
                      <p className="text-2xl font-bold text-white">{logs.length}</p>
                      <p className="text-xs text-zinc-500">total events</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-red-400">
                        {logs.filter(l => l.status === 'DOWN').length}
                      </p>
                      <p className="text-xs text-zinc-500">outages</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-400">
                        {logs.filter(l => l.status === 'UP' && l.note?.includes('recovered')).length}
                      </p>
                      <p className="text-xs text-zinc-500">recoveries</p>
                    </div>
                  </div>
                  {status && (
                    <div className="pt-3 border-t border-zinc-800">
                      <p className="text-xs text-zinc-500 mb-2">Services currently up</p>
                      <p className="text-sm text-white">
                        {Object.values(status.services).filter(s => s.up).length}
                        <span className="text-zinc-500"> / {Object.values(status.services).length}</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <LogTable logs={logs} />
      </div>
    </div>
  )
}
