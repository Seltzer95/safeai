import { useEffect, useRef, useState } from 'react'

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function EmbeddingDemo() {
  const workerRef = useRef<Worker | null>(null)
  const [status, setStatus] = useState<Status>('idle')

  useEffect(() => {
    console.log('[EmbeddingDemo] CLIENT HYDRATED ✓')
  }, [])
  const [progress, setProgress] = useState(0)
  const [backend, setBackend] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inputText, setInputText] = useState('')
  const [result, setResult] = useState<{ length: number; preview: number[] } | null>(null)

  useEffect(() => {
    const worker = new Worker(
      new URL('../worker/embedding.worker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.onerror = (e) => {
      console.error('[EmbeddingDemo] worker error:', e)
      setError(String(e.message))
      setStatus('error')
    }
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type: string; value?: number; backend?: string; data?: number[]; message?: string }
      console.log('[EmbeddingDemo] worker message:', msg.type)
      if (msg.type === 'PROGRESS') {
        setProgress(msg.value ?? 0)
      } else if (msg.type === 'LOADED') {
        setBackend(msg.backend ?? null)
        setStatus('ready')
      } else if (msg.type === 'EMBEDDED') {
        const nums = msg.data ?? []
        setResult({ length: nums.length, preview: nums.slice(0, 8) })
      } else if (msg.type === 'ERROR') {
        setError(msg.message ?? 'unknown error')
        setStatus('error')
      }
    }
    workerRef.current = worker
    return () => worker.terminate()
  }, [])

  function handleLoad() {
    console.log('CLICK FIRED')
    if (status === 'loading' || status === 'ready') return
    setStatus('loading')
    setProgress(0)
    setError(null)
    workerRef.current?.postMessage({ type: 'LOAD' })
  }

  function handleEmbed() {
    if (!inputText.trim()) return
    workerRef.current?.postMessage({ type: 'EMBED', text: inputText })
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-xl p-4 font-mono text-sm">
      <div>status: <strong>{status}</strong>{backend ? ` (${backend})` : ''}</div>

      <button
        type="button"
        onClick={handleLoad}
        disabled={status === 'loading' || status === 'ready'}
        className="self-start px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-40"
      >
        {status === 'loading' ? `Loading… ${progress}%` : 'Load Model'}
      </button>

      {error && <div className="text-red-500">Error: {error}</div>}

      {status === 'ready' && (
        <div className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleEmbed()}
            placeholder="Type text to embed…"
            className="flex-1 border rounded px-2 py-1 bg-background"
          />
          <button
            type="button"
            onClick={handleEmbed}
            disabled={!inputText.trim()}
            className="px-3 py-1 rounded bg-green-600 text-white disabled:opacity-40"
          >
            Embed
          </button>
        </div>
      )}

      {result && (
        <div className="border rounded p-3 bg-muted/30 space-y-1">
          <div>dims: {result.length}</div>
          <div>values[0..7]: [{result.preview.map((v) => v.toFixed(4)).join(', ')}]</div>
        </div>
      )}
    </div>
  )
}
