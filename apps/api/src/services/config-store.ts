import { randomUUID } from 'node:crypto';
import type { ParsedConfig } from './config-parser.js';
import { store } from '../lib/store.js';

// Writes parsed configs into the in-memory store, deduplicating by fingerprint.
// If we've seen a URI before we just refresh its `lastSeenAt` and (optionally)
// remember which source rediscovered it — no need to create a duplicate row.
export async function persistConfigs(
  configs: ParsedConfig[],
  sourceId?: string,
): Promise<number> {
  let added = 0;

  for (const c of configs) {
    const existing = store.byFingerprint.get(c.fingerprint);

    if (existing) {
      const row = store.configs.get(existing)!;
      row.lastSeenAt = new Date().toISOString();
      if (sourceId) row.sourceId = sourceId;
      continue;
    }

    const id = randomUUID();
    store.configs.set(id, {
      id,
      ...c,
      country: null,
      ip: null,
      sourceId: sourceId ?? null,
      lastSeenAt: new Date().toISOString(),
    });
    store.byFingerprint.set(c.fingerprint, id);
    added++;
  }

  return added;
}