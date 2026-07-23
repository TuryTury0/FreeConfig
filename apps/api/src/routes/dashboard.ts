import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { store, targets } from '../lib/store.js';
import { testQueue } from '../lib/queue.js';

export async function dashboardRoutes(app: FastifyInstance) {
  // Snapshot of the testing pipeline: what's waiting, what's running,
  // and how the finished tests broke down by status.
  app.get('/testing/summary', async () => {
    const results = [...store.configs.values()].flatMap((c) => (c.test ? [c.test] : []));

    const counts = new Map<string, number>();
    for (const result of results) {
      counts.set(result.status, (counts.get(result.status) ?? 0) + 1);
    }

    return {
      queue: await testQueue.getWaitingCount(),
      active: await testQueue.getActiveCount(),
      results: [...counts].map(([status, count]) => ({ status, count })),
    };
  });

  app.get('/testing/settings', async () => ({
    settings: store.settings,
    targets,
  }));

  // Users can tweak the target endpoint, sample count, and per-probe timeout
  // from the UI. We validate strictly — bad values could stall the whole queue.
  app.post('/testing/settings', async (request) => {
    const input = z
      .object({
        targetId: z.enum(['cloudflare', 'google', 'quad9']),
        samples: z.coerce.number().int().min(1).max(5),
        timeoutMs: z.coerce.number().int().min(1500).max(10_000),
      })
      .parse(request.body);

    const target = targets.find((item) => item.id === input.targetId)!;
    store.settings = { ...input, host: target.host, port: target.port };
    return { settings: store.settings };
  });
}