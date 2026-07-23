'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  Activity, CheckCircle2, Clock3, Copy, CopyCheck, Download,
  FlaskConical, Gauge, Play, RefreshCw, ShieldCheck, Sparkles,
  TrendingUp, XCircle, Zap,
} from 'lucide-react';
import { api, API } from '../../lib/api';

type Summary = { queue: number; active: number; results: { status: string; count: number }[] };
type Settings = {
  settings: { targetId: string; host: string; port: number; samples: number; timeoutMs: number };
  targets: { id: string; label: string }[];
};
type WorkingItem = {
  id: string; uri: string; host: string; port: number;
  protocol: string; country: string | null; label: string | null; latency_ms: number;
};
type WorkingList = { items: WorkingItem[]; count: number };

export default function Testing() {
  const { data } = useSWR<Summary>('/testing/summary', api, { refreshInterval: 1000 });
  const { data: working, mutate: refetchWorking } = useSWR<WorkingList>('/configs/working', api, {
    refreshInterval: 1500,
  });
  const { data: settings, mutate } = useSWR<Settings>('/testing/settings', api);

  const [batchCount, setBatchCount] = useState(50);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const prevWorkingIds = useRef<Set<string>>(new Set());
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());

  // Detect newly-working configs and flash them
  useEffect(() => {
    if (!working) return;
    const currentIds = new Set(working.items.map(w => w.id));
    const newIds = new Set<string>();
    for (const id of currentIds) {
      if (!prevWorkingIds.current.has(id)) newIds.add(id);
    }
    if (newIds.size > 0) {
      setFlashIds(prev => new Set([...prev, ...newIds]));
      setTimeout(() => {
        setFlashIds(prev => {
          const next = new Set(prev);
          for (const id of newIds) next.delete(id);
          return next;
        });
      }, 2500);
    }
    prevWorkingIds.current = currentIds;
  }, [working]);

  const workingCount = data?.results.find(x => x.status === 'working')?.count ?? 0;
  const failedCount  = data?.results.find(x => x.status === 'failed')?.count ?? 0;
  const timeoutCount = data?.results.find(x => x.status === 'timeout')?.count ?? 0;
  const totalTested  = workingCount + failedCount + timeoutCount;
  const successRate  = totalTested ? Math.round((workingCount / totalTested) * 100) : 0;

  const startBatch = async () => {
    setBusy(true); setNotice('');
    try {
      const r = await fetch(`${API}/api/configs/test-batch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ count: batchCount }),
      });
      const j = await r.json();
      setNotice(r.ok ? `✓ ${j.queued} configs queued` : 'Failed to start batch');
    } catch { setNotice('API unavailable'); }
    finally { setBusy(false); setTimeout(() => setNotice(''), 3500); }
  };

  const copyOne = async (item: WorkingItem) => {
    await navigator.clipboard.writeText(item.uri);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const copyAll = async () => {
    if (!working || working.items.length === 0) return;
    const text = working.items.map(w => w.uri).join('\n');
    await navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const downloadAll = () => {
    window.open(`${API}/api/configs/working/export`, '_blank');
  };

  const update = async (patch: Partial<Settings['settings']>) => {
    if (!settings) return;
    const body = {
      targetId: settings.settings.targetId,
      samples: settings.settings.samples,
      timeoutMs: settings.settings.timeoutMs,
      ...patch,
    };
    await fetch(`${API}/api/testing/settings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    mutate();
  };

  const latencyColor = (ms: number) =>
    ms < 500 ? 'text-emerald-400' : ms < 1500 ? 'text-yellow-400' : 'text-orange-400';

  return (
    <main className="mx-auto max-w-7xl px-5">
      {/* HEADER */}
      <div className="border-b line py-8">
        <div className="flex items-center gap-2">
          <span className="dot bg-emerald-400 animate-pulse" />
          <p className="eyebrow">Live operations</p>
        </div>
        <h1 className="mt-2 text-4xl font-medium tracking-[-.055em]">Testing dashboard</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
          Real-time Xray connectivity probes. Working configs stream in as tests complete —
          copy any one instantly, or grab them all at once.
        </p>
      </div>

      {/* METRICS */}
      <section className="grid gap-3 py-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={<Clock3 size={16} />}       label="In queue"     value={data?.queue ?? '—'} hint="Waiting for a worker" tone="neutral" />
        <MetricCard icon={<Activity size={16} />}     label="Testing now"  value={data?.active ?? '—'} hint="Xray processes running" tone="active" />
        <MetricCard icon={<CheckCircle2 size={16} />} label="Working"      value={workingCount} hint={`${successRate}% success rate`} tone="success" />
        <MetricCard icon={<XCircle size={16} />}      label="Failed"       value={failedCount + timeoutCount} hint={`${failedCount} failed · ${timeoutCount} timeout`} tone="danger" />
      </section>

      {/* PROGRESS */}
      {totalTested > 0 && (
        <section className="panel mb-4 rounded-xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Gauge size={15} className="text-zinc-400" />
              <span className="font-medium">Success rate</span>
              <span className="text-zinc-500">· {totalTested} tested</span>
            </div>
            <span className="font-mono text-sm">{successRate}%</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-zinc-900">
            <div className="bg-emerald-500 transition-all" style={{ width: `${(workingCount / totalTested) * 100}%` }} />
            <div className="bg-red-600/70 transition-all"  style={{ width: `${(failedCount / totalTested) * 100}%` }} />
            <div className="bg-amber-500/70 transition-all" style={{ width: `${(timeoutCount / totalTested) * 100}%` }} />
          </div>
          <div className="mt-3 flex gap-4 text-[11px] text-zinc-500">
            <span className="flex items-center gap-1.5"><i className="dot bg-emerald-500" /> Working {workingCount}</span>
            <span className="flex items-center gap-1.5"><i className="dot bg-red-600/70" /> Failed {failedCount}</span>
            <span className="flex items-center gap-1.5"><i className="dot bg-amber-500/70" /> Timeout {timeoutCount}</span>
          </div>
        </section>
      )}

      {/* MAIN GRID */}
      <section className="grid gap-4 pb-6 lg:grid-cols-[1fr_1.4fr]">
        {/* LEFT: Batch + Settings stacked */}
        <div className="space-y-4">
          {/* Batch runner */}
          <div className="panel rounded-xl p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-500/10">
                <FlaskConical size={18} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Batch runner</p>
                <p className="text-xs text-zinc-500">Test untested configurations</p>
              </div>
            </div>

            <label className="mb-2 block text-[10px] uppercase tracking-widest text-zinc-500">Batch size</label>
            <div className="mb-4 grid grid-cols-5 gap-2">
              {[10, 25, 50, 100, 200].map(n => (
                <button
                  key={n}
                  onClick={() => setBatchCount(n)}
                  className={`h-9 rounded-md border text-xs transition ${
                    batchCount === n
                      ? 'border-white bg-white text-black'
                      : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>

            <button
              onClick={startBatch}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
            >
              <Play size={15} />
              Test {batchCount} configs
            </button>

            {notice && (
              <p className="mt-3 rounded-md border border-emerald-800/40 bg-emerald-950/20 p-2 text-xs text-emerald-300">
                {notice}
              </p>
            )}

            <div className="mt-5 grid grid-cols-3 gap-3 border-t line pt-4 text-xs">
              <MiniStat icon={<Zap size={12} />}       label="Parallel"  value="16" />
              <MiniStat icon={<Clock3 size={12} />}    label="Timeout"   value="8 s"  />
              <MiniStat icon={<TrendingUp size={12} />} label="Prescan"  value="TCP" />
            </div>
          </div>

          {/* Settings */}
          <div className="panel rounded-xl p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-blue-500/10">
                <ShieldCheck size={18} className="text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Test profile</p>
                <p className="text-xs text-zinc-500">How each config is measured</p>
              </div>
            </div>

            <label className="mb-2 block text-[10px] uppercase tracking-widest text-zinc-500">Endpoint</label>
            <select
              value={settings?.settings.targetId ?? 'cloudflare'}
              onChange={(e) => update({ targetId: e.target.value })}
              className="mb-4 h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-xs outline-none focus:border-zinc-600"
            >
              {settings?.targets.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>

            <label className="mb-2 block text-[10px] uppercase tracking-widest text-zinc-500">Pings per config</label>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => update({ samples: n })}
                  className={`h-9 rounded-md border text-xs transition ${
                    settings?.settings.samples === n
                      ? 'border-white bg-white text-black'
                      : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Live working configs */}
        <div className="panel flex flex-col rounded-xl">
          <header className="flex items-center justify-between border-b line p-5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-500/10">
                <Sparkles size={18} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  Working configs
                  <span className="ml-2 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono text-emerald-400">
                    {working?.count ?? 0}
                  </span>
                </p>
                <p className="text-xs text-zinc-500">Streaming as tests complete</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => refetchWorking()}
                className="grid h-9 w-9 place-items-center rounded-md border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white"
                title="Refresh"
              >
                <RefreshCw size={14} />
              </button>
              <button
                onClick={downloadAll}
                disabled={!working?.count}
                className="grid h-9 w-9 place-items-center rounded-md border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white disabled:opacity-40"
                title="Download .txt"
              >
                <Download size={14} />
              </button>
              <button
                onClick={copyAll}
                disabled={!working?.count}
                className={`flex h-9 items-center gap-2 rounded-md px-3 text-xs font-medium transition disabled:opacity-40 ${
                  copiedAll ? 'bg-emerald-500 text-black' : 'bg-white text-black hover:bg-zinc-200'
                }`}
              >
                {copiedAll ? <><CopyCheck size={13} /> Copied</> : <><Copy size={13} /> Copy all</>}
              </button>
            </div>
          </header>

          <div className="max-h-[560px] min-h-[300px] overflow-y-auto">
            {(!working || working.items.length === 0) && (
              <div className="grid h-64 place-items-center text-center">
                <div>
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-zinc-900">
                    <Sparkles size={20} className="text-zinc-600" />
                  </div>
                  <p className="mt-4 text-sm text-zinc-500">No working configs yet</p>
                  <p className="mt-1 text-xs text-zinc-600">Run a batch to start filling this list</p>
                </div>
              </div>
            )}

            {working?.items.map((item) => {
              const isFlash = flashIds.has(item.id);
              const isCopied = copiedId === item.id;
              return (
                <div
                  key={item.id}
                  className={`group grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 border-b line px-5 py-3 transition-colors last:border-0 ${
                    isFlash ? 'bg-emerald-500/10' : 'hover:bg-white/[.02]'
                  }`}
                >
                  <div className="flex flex-col items-center">
                    <span className={`font-mono text-sm font-semibold ${latencyColor(item.latency_ms)}`}>
                      {item.latency_ms}
                    </span>
                    <span className="text-[9px] uppercase tracking-widest text-zinc-600">ms</span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[9px] uppercase text-zinc-400">
                        {item.protocol}
                      </span>
                      <span className="truncate text-sm text-zinc-200">
                        {item.label || item.host || 'Unnamed'}
                      </span>
                      {item.country && (
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-mono text-zinc-300">
                          {item.country}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-600">
                      {item.host}:{item.port}
                    </p>
                  </div>

                  {isFlash && (
                    <span className="rounded bg-emerald-500/20 px-2 py-1 text-[10px] font-medium text-emerald-300">
                      NEW
                    </span>
                  )}

                  <button
                    onClick={() => copyOne(item)}
                    className={`grid h-8 w-8 place-items-center rounded-md transition ${
                      isCopied
                        ? 'bg-emerald-500 text-black'
                        : 'text-zinc-500 opacity-60 hover:bg-zinc-800 hover:text-white group-hover:opacity-100'
                    }`}
                    title="Copy config"
                  >
                    {isCopied ? <CopyCheck size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function MetricCard({
  icon, label, value, hint, tone,
}: {
  icon: React.ReactNode; label: string; value: number | string; hint: string;
  tone: 'neutral' | 'active' | 'success' | 'danger';
}) {
  const toneColor = {
    neutral: 'text-zinc-400', active: 'text-blue-400',
    success: 'text-emerald-400', danger: 'text-red-400',
  }[tone];
  return (
    <div className="panel relative overflow-hidden rounded-xl p-5">
      <div className={`flex items-center gap-2 ${toneColor}`}>
        {icon}
        <span className="text-[10px] uppercase tracking-widest">{label}</span>
      </div>
      <p className="mt-6 text-4xl font-medium tracking-[-.06em]">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-zinc-500">
        {icon}
        <span className="text-[10px] uppercase tracking-widest">{label}</span>
      </div>
      <p className="mt-1 text-xs text-zinc-300">{value}</p>
    </div>
  );
}