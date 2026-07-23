import { request } from 'undici';
import { store } from '../lib/store.js';
import { splitConfigs } from './config-parser.js';
import { persistConfigs } from './config-store.js';
import { broadcast } from './broadcast.js';

const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

export async function syncSource(id: string): Promise<void> {
  const source = store.sources.get(id);
  if (!source?.enabled) return;

  try {
    const response = await request(source.url, {
      headers: { 'user-agent': 'Anythings-by-TUry/1.0' },
      headersTimeout: 10_000,
      bodyTimeout:    30_000,
    });

    if (response.statusCode !== 200) {
      throw new Error(`upstream_${response.statusCode}`);
    }

    const body = await response.body.text();

    if (Buffer.byteLength(body) > MAX_SOURCE_BYTES) {
      throw new Error('source_too_large');
    }

    const parsed = splitConfigs(body);
    const added  = await persistConfigs(parsed, id);

    // Count ALL configs associated with this source (not just newly added ones)
    const total = [...store.configs.values()].filter(c => c.sourceId === id).length;

    source.lastSyncedAt  = new Date().toISOString();
    source.lastError     = null;
    source.configCount   = total;

    broadcast('source.synced', { id, added, total });

  } catch (error) {
    source.lastError = error instanceof Error ? error.message : 'sync_failed';
    broadcast('source.error', { id, error: source.lastError });
    throw error;
  }
}