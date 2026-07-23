import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { store } from '../lib/store.js';
import { testQueue } from '../lib/queue.js';

export async function configRoutes(app: FastifyInstance) {
  app.get('/configs', async (req) => {
    const q = z.object({
      cursor: z.string().uuid().optional(),
      limit: z.coerce.number().min(1).max(100).default(50),
      search: z.string().max(120).optional(),
      protocol: z.string().max(20).optional(),
      country: z.string().length(2).optional(),
      maxLatency: z.coerce.number().positive().optional(),
      status: z.enum(['working', 'failed', 'timeout', 'queued', 'running']).optional(),
      sort: z.enum(['recent', 'latency', 'speed']).default('recent'),
    }).parse(req.query);

    let rows = [...store.configs.values()]
      .filter(c => !q.protocol || c.protocol === q.protocol)
      .filter(c => !q.country || c.country === q.country.toUpperCase())
      .filter(c => !q.status || c.test?.status === q.status)
      .filter(c => !q.search || `${c.host ?? ''} ${c.label ?? ''} ${c.protocol}`.toLowerCase().includes(q.search.toLowerCase()))
      .filter(c => !q.maxLatency || (c.test?.latencyMs ?? Infinity) <= q.maxLatency);

    rows.sort((a, b) =>
      q.sort === 'latency' ? (a.test?.latencyMs ?? Infinity) - (b.test?.latencyMs ?? Infinity) :
      q.sort === 'speed'   ? (b.test?.speedBps ?? 0) - (a.test?.speedBps ?? 0) :
                             b.lastSeenAt.localeCompare(a.lastSeenAt),
    );

    if (q.cursor) {
      const at = rows.findIndex(c => c.id === q.cursor);
      rows = at >= 0 ? rows.slice(at + 1) : rows;
    }

    const items = rows.slice(0, q.limit).map(c => ({
      id: c.id, uri: c.uri, protocol: c.protocol, host: c.host, port: c.port,
      country: c.country, ip: c.ip, label: c.label, last_seen_at: c.lastSeenAt,
      status: c.test?.status, latency_ms: c.test?.latencyMs,
      sample_count: c.test?.samples, speed_bps: c.test?.speedBps,
    }));

    return { items, nextCursor: rows.length > q.limit ? items.at(-1)?.id : null };
  });

  app.post('/configs/:id/test', async (req, rep) => {
    const id = z.string().uuid().parse((req.params as { id: string }).id);
    if (!store.configs.has(id)) return rep.code(404).send({ error: 'not_found' });
    await testQueue.add('test', { configId: id });
    return rep.code(202).send({ queued: true });
  });

  app.post('/configs/test-batch', async (req, rep) => {
    const count = z.object({ count: z.coerce.number().int().min(1).max(500).default(50) }).parse(req.body).count;
    const eligible = [...store.configs.values()]
      .filter(c => !c.test)
      .sort((a, b) => a.lastSeenAt.localeCompare(b.lastSeenAt))
      .slice(0, count);
    for (const config of eligible) {
      config.test = { status: 'queued', testedAt: new Date().toISOString() };
      await testQueue.add('test', { configId: config.id });
    }
    return rep.code(202).send({ queued: eligible.length });
  });

  // Retest all configs — useful for periodic revalidation
  app.post('/configs/retest-all', async (req, rep) => {
    const eligible = [...store.configs.values()];
    for (const config of eligible) {
      config.test = { status: 'queued', testedAt: new Date().toISOString() };
      await testQueue.add('test', { configId: config.id });
    }
    return rep.code(202).send({ queued: eligible.length });
  });

  // Return every currently-working config as plain text (one URI per line)
  app.get('/configs/working/export', async (_req, rep) => {
    const working = [...store.configs.values()]
      .filter(c => c.test?.status === 'working')
      .sort((a, b) => (a.test?.latencyMs ?? 0) - (b.test?.latencyMs ?? 0));
    const body = working.map(c => c.uri).join('\n');
    rep.header('content-type', 'text/plain; charset=utf-8');
    rep.header('content-disposition', 'attachment; filename="anythings-working.txt"');
    return body;
  });

  // JSON summary of working configs (for live UI)
  app.get('/configs/working', async () => {
    const working = [...store.configs.values()]
      .filter(c => c.test?.status === 'working')
      .sort((a, b) => (a.test?.latencyMs ?? 0) - (b.test?.latencyMs ?? 0))
      .map(c => ({
        id: c.id, uri: c.uri, host: c.host, port: c.port,
        protocol: c.protocol, country: c.country, label: c.label,
        latency_ms: c.test?.latencyMs,
      }));
    return { items: working, count: working.length };
  });

  app.get('/stats', async () => {
    const configs = [...store.configs.values()];
    return {
      total: configs.length,
      working: configs.filter(c => c.test?.status === 'working').length,
      last_update: [...store.sources.values()].map(s => s.lastSyncedAt).sort().at(-1) ?? null,
      protocols: new Set(configs.map(c => c.protocol)).size,
    };
  });
}