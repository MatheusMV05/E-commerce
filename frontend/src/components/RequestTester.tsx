import { useState } from 'react'
import { cn } from '@/lib/utils'

const GATEWAY = (import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? 'http://localhost:8000'

const SHORTCUTS = [
  { label: 'GET /products',        method: 'GET',  path: '/products',       body: '' },
  { label: 'GET /health/status',   method: 'GET',  path: '/health/status',  body: '' },
  { label: 'POST /users/register', method: 'POST', path: '/users/register', body: '{\n  "name": "",\n  "email": "",\n  "password": "",\n  "role": "user"\n}' },
  { label: 'POST /users/login',    method: 'POST', path: '/users/login',    body: '{\n  "email": "",\n  "password": ""\n}' },
  { label: 'POST /products',       method: 'POST', path: '/products',       body: '{\n  "name": "",\n  "description": "",\n  "price": 0,\n  "stock": 0\n}' },
  { label: 'POST /orders',         method: 'POST', path: '/orders',         body: '{\n  "productId": "",\n  "quantity": 1\n}' },
] as const

type Shortcut = typeof SHORTCUTS[number]

interface ApiResponse { status: number; data: unknown }

interface HistoryEntry {
  id: number
  method: string
  path: string
  status: number
  time: string
}

const statusColor = (s: number) =>
  s === 0       ? 'bg-zinc-700 text-zinc-400'
  : s < 300     ? 'bg-green-500/20 text-green-400'
  : s < 400     ? 'bg-blue-500/20 text-blue-400'
  : s < 500     ? 'bg-yellow-500/20 text-yellow-400'
  : 'bg-red-500/20 text-red-400'

let _id = 0

export function RequestTester() {
  const [method, setMethod]     = useState<string>('GET')
  const [path, setPath]         = useState('/products')
  const [token, setToken]       = useState('')
  const [body, setBody]         = useState('')
  const [response, setResponse] = useState<ApiResponse | null>(null)
  const [loading, setLoading]   = useState(false)
  const [history, setHistory]   = useState<HistoryEntry[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [responses, setResponses] = useState<Record<number, ApiResponse>>({})

  const applyShortcut = (s: Shortcut) => {
    setMethod(s.method)
    setPath(s.path)
    setBody(s.body)
    setResponse(null)
    setSelected(null)
  }

  const send = async () => {
    setLoading(true)
    setSelected(null)
    const sentMethod = method
    const sentPath = path
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token.trim()) headers['Authorization'] = `Bearer ${token.trim()}`
      const res = await fetch(`${GATEWAY}${sentPath.startsWith('/') ? sentPath : '/' + sentPath}`, {
        method: sentMethod,
        headers,
        body: sentMethod !== 'GET' && body.trim() ? body : undefined,
      })
      const data = await res.json().catch(() => null)
      const entry: ApiResponse = { status: res.status, data }
      setResponse(entry)
      const id = ++_id
      setHistory(h => [{ id, method: sentMethod, path: sentPath, status: res.status, time: new Date().toLocaleTimeString() }, ...h.slice(0, 19)])
      setResponses(r => ({ ...r, [id]: entry }))
    } catch (e) {
      const entry: ApiResponse = { status: 0, data: { error: String(e) } }
      setResponse(entry)
      const id = ++_id
      setHistory(h => [{ id, method: sentMethod, path: sentPath, status: 0, time: new Date().toLocaleTimeString() }, ...h.slice(0, 19)])
      setResponses(r => ({ ...r, [id]: entry }))
    } finally {
      setLoading(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send()
  }

  const activeResponse = selected !== null ? responses[selected] : response

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-white">Request Tester</h3>

      <div className="flex flex-wrap gap-1">
        {SHORTCUTS.map(s => (
          <button
            key={s.label}
            onClick={() => applyShortcut(s)}
            className={cn(
              'text-xs px-2 py-0.5 rounded border transition-colors',
              method === s.method && path === s.path
                ? 'border-zinc-500 text-white bg-zinc-800'
                : 'border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <select
          value={method}
          onChange={e => setMethod(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-white text-xs rounded px-2 py-1.5 cursor-pointer"
        >
          {['GET', 'POST', 'PUT', 'DELETE'].map(m => <option key={m}>{m}</option>)}
        </select>
        <input
          value={path}
          onChange={e => setPath(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="/path"
          className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-xs rounded px-3 py-1.5 font-mono focus:outline-none focus:border-zinc-500"
        />
        <button
          onClick={send}
          disabled={loading}
          className="bg-white text-zinc-900 text-xs font-semibold px-4 py-1.5 rounded hover:bg-zinc-200 disabled:opacity-40 transition-colors"
        >
          {loading ? '…' : 'Send'}
        </button>
      </div>

      <input
        value={token}
        onChange={e => setToken(e.target.value)}
        placeholder="Authorization token (optional)"
        className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded px-3 py-1.5 font-mono focus:outline-none focus:border-zinc-500"
      />

      {method !== 'GET' && (
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder='{ "key": "value" }'
          rows={4}
          className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded px-3 py-1.5 font-mono focus:outline-none focus:border-zinc-500 resize-none"
        />
      )}

      {activeResponse && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', statusColor(activeResponse.status))}>
              {activeResponse.status === 0 ? 'ERR' : activeResponse.status}
            </span>
            <span className="text-xs text-zinc-500">
              {activeResponse.status === 0 ? 'Network error' : 'Response'}
            </span>
            {selected !== null && (
              <button
                onClick={() => setSelected(null)}
                className="ml-auto text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                ← latest
              </button>
            )}
          </div>
          <pre className="bg-zinc-950 border border-zinc-800 rounded p-3 text-xs text-zinc-300 overflow-x-auto max-h-48">
            {JSON.stringify(activeResponse.data, null, 2)}
          </pre>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-zinc-500">Request history</p>
            <button
              onClick={() => { setHistory([]); setResponses({}); setSelected(null) }}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              clear
            </button>
          </div>
          <div className="rounded border border-zinc-800 overflow-hidden">
            {history.map(entry => (
              <button
                key={entry.id}
                onClick={() => setSelected(selected === entry.id ? null : entry.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors text-left border-b border-zinc-800/50 last:border-0',
                  selected === entry.id ? 'bg-zinc-800' : 'hover:bg-zinc-800/50',
                )}
              >
                <span className={cn('font-mono font-medium w-10 shrink-0', entry.method === 'GET' ? 'text-blue-400' : 'text-yellow-400')}>
                  {entry.method}
                </span>
                <span className="text-zinc-300 font-mono flex-1 truncate">{entry.path}</span>
                <span className={cn('px-1.5 py-0.5 rounded-full font-medium shrink-0', statusColor(entry.status))}>
                  {entry.status === 0 ? 'ERR' : entry.status}
                </span>
                <span className="text-zinc-600 shrink-0">{entry.time}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-600">Ctrl+Enter to send · click history row to inspect</p>
    </div>
  )
}
