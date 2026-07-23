'use client';

import { useState } from 'react';
import { Activity, CheckCircle2, Copy, Loader2, XCircle } from 'lucide-react';
import { API } from '../../lib/api';

type TestResult = {
  success: boolean;
  latencyMs?: number;
  ip?: string;
  country?: string;
  error?: string;
  xrayLog?: string;
};

export default function Tester() {
  const [uri, setUri] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const runTest = async () => {
    if (!uri.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await fetch(`${API}/api/test-single`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uri: uri.trim() }),
      });
      const data = await r.json();
      setResult(data);
    } catch (e) {
      setResult({ success: false, error: e instanceof Error ? e.message : 'API unavailable' });
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string) => navigator.clipboard.writeText(text);

  return (
    <main className="mx-auto max-w-3xl px-5">
      <div className="border-b line py-8">
        <p className="eyebrow">Direct test</p>
        <h1 className="mt-1 text-3xl tracking-[-.05em]">Config tester</h1>
        <p className="mt-3 text-sm text-zinc-500">
          Paste one config URI. It will be tested directly with Xray and report back working or not.
        </p>
      </div>

      <div className="py-6">
        <textarea
          value={uri}
          onChange={(e) => setUri(e.target.value)}
          placeholder="vless://... or trojan://... or vmess://..."
          rows={3}
          className="w-full resize-none rounded-lg border line bg-black p-4 font-mono text-sm outline-none placeholder:text-zinc-700 focus:border-zinc-500"
        />

        <button
          disabled={loading || !uri.trim()}
          onClick={runTest}
          className="mt-4 flex items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-40"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
          {loading ? 'Testing…' : 'Test config'}
        </button>
      </div>

      {result && (
        <div
          className={`rounded-xl border p-6 ${
            result.success
              ? 'border-emerald-800 bg-emerald-950/20'
              : 'border-red-800 bg-red-950/20'
          }`}
        >
          <div className="flex items-start gap-3">
            {result.success ? (
              <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={22} />
            ) : (
              <XCircle className="mt-0.5 shrink-0 text-red-400" size={22} />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-medium">
                {result.success ? 'Working ✓' : 'Not working ✗'}
              </h2>

              {result.success && (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-black/30 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500">Latency</p>
                    <p className="mt-1 text-xl font-medium">{result.latencyMs ?? '—'} ms</p>
                  </div>
                  <div className="rounded-lg bg-black/30 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500">IP</p>
                    <p className="mt-1 truncate font-mono text-sm">{result.ip ?? '—'}</p>
                  </div>
                  <div className="rounded-lg bg-black/30 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500">Country</p>
                    <p className="mt-1 text-sm">{result.country ?? '—'}</p>
                  </div>
                </div>
              )}

              {result.error && (
                <div className="mt-3">
                  <p className="text-xs text-zinc-400">Error:</p>
                  <pre className="mt-1 whitespace-pre-wrap rounded bg-black/40 p-3 font-mono text-xs text-red-300">
                    {result.error}
                  </pre>
                </div>
              )}

              {result.xrayLog && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
                    Xray output
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-3 font-mono text-[11px] text-zinc-400">
                    {result.xrayLog}
                  </pre>
                </details>
              )}

              {result.success && (
                <button
                  onClick={() => copy(uri.trim())}
                  className="mt-4 flex items-center gap-2 rounded-md border border-emerald-700 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-900/30"
                >
                  <Copy size={13} /> Copy working config
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}