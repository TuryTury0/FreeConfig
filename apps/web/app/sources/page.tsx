'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import {
  CheckCircle2,
  ClipboardPaste,
  FileText,
  GitBranch,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { API, api } from '../../lib/api';

type Source = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  last_synced_at: string;
  last_error: string;
  config_count: number;
};

export default function Sources() {
  const { data, error, mutate } = useSWR<{ items: Source[] }>('/sources', api);

  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Kick off a repository sync. The API returns immediately (the actual fetch
  // runs in the sync worker) so we give the UI a beat before refreshing.
  const sync = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`${API}/api/sources/${id}/sync`, { method: 'POST' });
      setNotice('Sync started. This page will refresh shortly.');
      setTimeout(() => mutate(), 1400);
    } catch {
      setNotice('Could not start sync. Check that the API is running.');
    } finally {
      setBusy(false);
    }
  };

  const importText = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setNotice('');

    try {
      const r = await fetch(`${API}/api/imports/text`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);

      setNotice(`${result.accepted} configuration(s) imported. Open Explorer to view them.`);
      setText('');
    } catch (e) {
      setNotice(`Import failed: ${e instanceof Error ? e.message : 'API unavailable'}`);
    } finally {
      setBusy(false);
    }
  };

  const chooseFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setNotice('');

    try {
      const form = new FormData();
      form.append('file', file);

      const r = await fetch(`${API}/api/imports`, {
        method: 'POST',
        body: form,
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);

      setNotice(`${result.accepted} configuration(s) imported from ${file.name}.`);
    } catch (e) {
      setNotice(`File import failed: ${e instanceof Error ? e.message : 'API unavailable'}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-5">
      <div className="border-b line py-8">
        <p className="eyebrow">Repository network</p>
        <h1 className="mt-1 text-3xl tracking-[-.05em]">GitHub sources</h1>
        <p className="mt-3 text-sm text-zinc-500">
          Sync a connected feed, paste individual configurations, or import a TXT file.
        </p>
      </div>

      <section className="grid gap-4 py-6 lg:grid-cols-[1fr_.9fr]">
        <div>
          {error && (
            <div className="mb-4 rounded-lg border border-red-900 bg-red-950/20 p-4 text-sm text-red-300">
              API is unavailable. Start the project with{' '}
              <code className="rounded bg-black px-1.5 py-1">npm run dev</code>, then refresh this page.
            </div>
          )}

          {data?.items.map((s) => (
            <article
              key={s.id}
              className="panel mb-3 flex flex-col gap-5 rounded-xl p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 gap-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-zinc-800">
                  <GitBranch size={18} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-medium">{s.name}</h2>
                  <p className="mt-1 truncate font-mono text-[11px] text-zinc-600">{s.url}</p>
                  <p className="mt-3 text-xs text-zinc-500">
                    {s.config_count.toLocaleString()} fetched ·{' '}
                    {s.last_synced_at ? new Date(s.last_synced_at).toLocaleString() : 'Not synced yet'}
                    {s.last_error && <span className="text-red-400"> · {s.last_error}</span>}
                  </p>
                </div>
              </div>

              <button
                disabled={busy}
                onClick={() => sync(s.id)}
                className="flex shrink-0 items-center justify-center gap-2 rounded-md border line px-3 py-2 text-xs hover:border-zinc-500 disabled:opacity-50"
              >
                <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
                Sync now
              </button>
            </article>
          ))}

          {!data && !error && (
            <p className="py-10 text-sm text-zinc-600">Connecting to local API…</p>
          )}
        </div>

        <aside className="panel rounded-xl p-5">
          <div className="flex items-center gap-2">
            <ClipboardPaste size={16} />
            <h2 className="text-sm font-medium">Manual import</h2>
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-500">
            Paste one or many lines. Supported URI formats are detected automatically.
          </p>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'vless://...\ntrojan://...\nss://...'}
            className="mt-4 h-40 w-full resize-none rounded-md border line bg-black p-3 font-mono text-xs outline-none placeholder:text-zinc-700 focus:border-zinc-500"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              disabled={busy || !text.trim()}
              onClick={importText}
              className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-xs font-medium text-black disabled:opacity-40"
            >
              <Upload size={14} /> Import pasted configs
            </button>

            <button
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 rounded-md border line px-3 py-2 text-xs"
            >
              <FileText size={14} /> Import TXT file
            </button>

            <input
              ref={fileRef}
              onChange={(e) => chooseFile(e.target.files?.[0])}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
            />
          </div>

          {notice && (
            <p className="mt-4 flex gap-2 text-xs text-emerald-400">
              <CheckCircle2 size={14} />
              {notice}
            </p>
          )}
        </aside>
      </section>
    </main>
  );
}