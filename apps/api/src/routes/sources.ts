import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { store } from '../lib/store.js';
import { syncQueue } from '../lib/queue.js';

export async function sourceRoutes(app: FastifyInstance) {
  // List every configured source with its most recent sync status.
  app.get('/sources', async () => ({
    items: [...store.sources.values()].map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      enabled: s.enabled,
      last_synced_at: s.lastSyncedAt,
      last_error: s.lastError,
      config_count: s.configCount,
    })),
  }));

  // Queue a sync job. The actual HTTP fetch happens in the sync worker so
  // the request returns immediately even for slow upstreams.
  app.post('/sources/:id/sync', async (req, rep) => {
    const id = z.string().uuid().parse((req.params as { id: string }).id);
    if (!store.sources.has(id)) return rep.code(404).send({ error: 'not_found' });

    await syncQueue.add('sync', { sourceId: id });
    return rep.code(202).send({ queued: true });
  });
}