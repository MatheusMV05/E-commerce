import { useEffect, useState, useCallback } from 'react'
import { fetchStatus, fetchLogs } from './lib/api'
import type { HealthStatus, LogEntry, RequestEntry, UnifiedEntry } from './lib/api'
import { ServiceCard } from './components/ServiceCard'
import { LogTable } from './components/LogTable'
import { RequestTester } from './components/RequestTester'

export default function App() {
  const [status, setStatus]           = useState<HealthStatus | null>(null)
  const [heartbeatLogs, setHeartbeatLogs] = useState<LogEntry[]>([])
  const [requestLogs, setRequestLogs] = useState<RequestEntry[]>([])
  const [error, setError]             = useState<string | null>(null)
  const [lastUpdate, setLastUpdate]   = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([fetchStatus(), fetchLogs()])
      setStatus(s)
      setHeartbeatLogs(l.logs.map(e => ({ ...e, kind: 'heartbeat' as const })))
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

  const handleRequest = (entry: RequestEntry) => {
    setRequestLogs(prev => [entry, ...prev])
  }

  const unified: UnifiedEntry[] = [...requestLogs, ...heartbeatLogs]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  const servicesUp    = status ? Object.values(status.services).filter(s => s.up).length : 0
  const servicesTotal = status ? Object.values(status.services).length : 0
  const outages       = heartbeatLogs.filter(l => l.status === 'DOWN').length
  const recoveries    = heartbeatLogs.filter(l => l.status === 'UP' && l.note?.includes('recovered')).length

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
            {error}
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
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Event Stats</h3>
            {!status ? (
              <p className="text-xs text-zinc-500">Connecting…</p>
            ) : (
              <div className="space-y-4">
                <div className="flex gap-6">
                  <div>
                    <p className="text-2xl font-bold text-white">{unified.length}</p>
                    <p className="text-xs text-zinc-500">events</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-400">{outages}</p>
                    <p className="text-xs text-zinc-500">outages</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-400">{recoveries}</p>
                    <p className="text-xs text-zinc-500">recoveries</p>
                  </div>
                </div>
                <div className="pt-3 border-t border-zinc-800">
                  <p className="text-xs text-zinc-500 mb-1">Services online</p>
                  <p className="text-sm font-medium text-white">
                    {servicesUp}
                    <span className="text-zinc-500"> / {servicesTotal}</span>
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            <RequestTester onRequest={handleRequest} />
          </div>
        </div>

        <LogTable entries={unified} />

      </div>
    </div>
  )
}
