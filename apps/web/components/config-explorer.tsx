'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Copy, Download, Loader2, QrCode, Search, TestTube2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { API, api } from '../lib/api';

type ConfigRow = {
  id: string;
  uri: string;
  protocol: string;
  host: string;
  port: number;
  country: string;
  label: string;
  status?: string;
  latency_ms?: number;
  speed_bps?: number;
  sample_count?: number;
};

const fetcher = (p: string) => api<{ items: ConfigRow[]; nextCursor: string | null }>(p);

export function ConfigExplorer() {
  const [search, setSearch] = useState('');
  const [protocol, setProtocol] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [qr, setQr] = useState<string | null>(null);

  // Build the SWR key from every filter so a change automatically refetches.
  const key =
    '/configs?limit=50' +
    (search   ? `&search=${encodeURIComponent(search)}` : '') +
    (protocol ? `&protocol=${protocol}` : '') +
    (cursor   ? `&cursor=${cursor}` : '');

  const { data, isLoading } = useSWR(key, fetcher);

  // Append when paginating, replace on a fresh search.
  useEffect(() => {
    if (data) setRows((x) => (cursor ? [...x, ...data.items] : data.items));
  }, [data, cursor]);

  // Reset the cursor whenever the filters change so we don't paginate
  // through a stale result set.
  useEffect(() => {
    const t = setTimeout(() => setCursor(null), 300);
    return () => clearTimeout(t);
  }, [search, protocol]);

  const copy = (v: string) => navigator.clipboard.writeText(v);

  const exportRows = () => {
    const blob = new Blob([rows.map((x) => x.uri).join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'anythings-configs.txt';
    a.click();
  };

  return (
    <>
      <div className="flex flex-col gap-4 border-b line py-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">Catalog</p>
          <h1 className="mt-1 text-2xl tracking-[-.05em]">Config explorer</h1>
        </div>
        <button
          onClick={exportRows}
          className="flex items-center gap-2 rounded-md border line px-3 py-2 text-xs"
        >
          <Download size={14} /> Export visible
        </button>
      </div>

      <div className="my-5 flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-1 items-center gap-2 rounded-md border line bg-zinc-950 px-3">
          <Search size={16} className="text-zinc-600" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find host, label, or protocol"
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-zinc-600"
          />
        </label>

        <select
          value={protocol}
          onChange={(e) => setProtocol(e.target.value)}
          className="h-12 rounded-md border line bg-zinc-950 px-3 text-sm outline-none"
        >
          <option value="">All protocols</option>
          {['vless', 'vmess', 'trojan', 'ss', 'hysteria2', 'socks', 'http'].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border line">
        <div className="hidden grid-cols-[1.2fr_.6fr_.4fr_.45fr] gap-3 border-b line px-5 py-3 text-[10px] uppercase tracking-widest text-zinc-600 md:grid">
          <span>Endpoint</span>
          <span>Protocol</span>
          <span>Latency</span>
          <span />
        </div>

        {rows.map((c) => (
          <div
            key={c.id}
            className="grid gap-3 border-b line px-4 py-4 last:border-0 md:grid-cols-[1.2fr_.6fr_.4fr_.45fr] md:items-center md:px-5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm">{c.label || c.host || 'Unnamed endpoint'}</p>
              <p className="mt-1 truncate font-mono text-[11px] text-zinc-600">
                {c.host}
                {c.port ? `:${c.port}` : ''}
              </p>
            </div>

            <span className="w-fit rounded border border-zinc-700 px-2 py-1 font-mono text-[10px] uppercase text-zinc-400">
              {c.protocol}
            </span>

            <span className="text-xs text-zinc-400">
              {c.latency_ms
                ? `${c.latency_ms} ms · ${c.sample_count || 1} ping${(c.sample_count || 1) > 1 ? 's' : ''}`
                : '—'}
            </span>

            <div className="flex gap-2 md:justify-end">
              <button
                title="Copy"
                onClick={() => copy(c.uri)}
                className="rounded p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <Copy size={15} />
              </button>
              <button
                title="QR code"
                onClick={() => setQr(c.uri)}
                className="rounded p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <QrCode size={15} />
              </button>
              <button
                title="Test"
                onClick={() => fetch(`${API}/api/configs/${c.id}/test`, { method: 'POST' })}
                className="rounded p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <TestTube2 size={15} />
              </button>
            </div>
          </div>
        ))}

        {!isLoading && !rows.length && (
          <p className="p-12 text-center text-sm text-zinc-600">
            No matching configurations yet.
          </p>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center p-6">
          <Loader2 className="animate-spin text-zinc-600" />
        </div>
      )}

      {data?.nextCursor && (
        <button
          onClick={() => setCursor(data.nextCursor)}
          className="mx-auto my-6 block rounded-md border line px-4 py-2 text-xs"
        >
          Load more
        </button>
      )}

      {qr && (
        <div
          onClick={() => setQr(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-5"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="rounded-xl bg-white p-7 text-black"
          >
            <QRCodeSVG value={qr} size={220} />
            <p className="mt-4 max-w-[220px] truncate text-xs">Scan configuration</p>
          </div>
        </div>
      )}
    </>
  );
}