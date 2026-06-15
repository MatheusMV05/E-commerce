const GATEWAY = (import.meta.env.VITE_GATEWAY_URL as string) ?? 'http://localhost:8000'

export interface ServiceState {
  up: boolean
  fail_count: number
  last_ping: string | null
  latency_ms: number | null
}

export interface HealthStatus {
  services: Record<string, ServiceState>
  timestamp: string
}

export interface LogEntry {
  kind: 'heartbeat'
  service: string
  status: string
  note: string
  timestamp: string
}

export interface RequestEntry {
  kind: 'request'
  method: string
  path: string
  status: number
  timestamp: string
}

export type UnifiedEntry = LogEntry | RequestEntry

export interface HealthLogs {
  logs: LogEntry[]
  count: number
}

export async function fetchStatus(): Promise<HealthStatus> {
  const r = await fetch(`${GATEWAY}/health/status`)
  if (!r.ok) throw new Error('Gateway unreachable')
  return r.json()
}

export async function fetchLogs(): Promise<HealthLogs> {
  const r = await fetch(`${GATEWAY}/health/logs`)
  if (!r.ok) throw new Error('Gateway unreachable')
  return r.json()
}
