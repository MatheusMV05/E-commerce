import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { RequestEntry } from '@/lib/api'

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

const statusColor = (s: number) =>
  s === 0   ? 'bg-zinc-700 text-zinc-400'
  : s < 300 ? 'bg-green-500/20 text-green-400'
  : s < 400 ? 'bg-blue-500/20 text-blue-400'
  : s < 500 ? 'bg-yellow-500/20 text-yellow-400'
  :           'bg-red-500/20 text-red-400'

interface Props {
  onRequest: (entry: RequestEntry) => void
}

export function RequestTester({ onRequest }: Props) {
  const [method, setMethod]     = useState<string>('GET')
  const [path, setPath]         = useState('/products')
  const [token, setToken]       = useState('')
  const [body, setBody]         = useState('')
  const [response, setResponse] = useState<ApiResponse | null>(null)
  const [loading, setLoading]   = useState(false)

  const applyShortcut = (s: Shortcut) => {
    setMethod(s.method)
    setPath(s.path)
    setBody(s.body)
    setResponse(null)
  }

  const send = async () => {
    setLoading(true)
    setResponse(null)
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
      setResponse({ status: res.status, data })
      onRequest({ kind: 'request', method: sentMethod, path: sentPath, status: res.status, timestamp: new Date().toISOString() })
    } catch (e) {
      setResponse({ status: 0, data: { error: String(e) } })
      onRequest({ kind: 'request', method: sentMethod, path: sentPath, status: 0, timestamp: new Date().toISOString() })
    } finally {
      setLoading(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send()
  }

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

      {response && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', statusColor(response.status))}>
              {response.status === 0 ? 'ERR' : response.status}
            </span>
            <span className="text-xs text-zinc-500">
              {response.status === 0 ? 'Network error' : 'Response'}
            </span>
          </div>
          <pre className="bg-zinc-950 border border-zinc-800 rounded p-3 text-xs text-zinc-300 overflow-x-auto max-h-52">
            {JSON.stringify(response.data, null, 2)}
          </pre>
        </div>
      )}

      <p className="text-xs text-zinc-600">Ctrl+Enter to send</p>
    </div>
  )
}
