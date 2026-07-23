import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';

import { env } from './lib/env.js';
import { addPeer } from './services/broadcast.js';

import { configRoutes } from './routes/configs.js';
import { sourceRoutes } from './routes/sources.js';
import { importRoutes } from './routes/imports.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { testSingleRoute } from './routes/test-single.js';

// Importing the workers has a side effect: they register handlers with the
// in-process queues. Keep these imports here or the queues will silently
// pile up jobs with nothing to consume them.
import './workers/test-worker.js';
import './workers/sync-worker.js';

const app = Fastify({
  logger: true,
  bodyLimit: 2 * 1024 * 1024,
});

await app.register(cors, {
  origin: env.WEB_ORIGIN,
  methods: ['GET', 'POST'],
});

await app.register(multipart, {
  limits: { files: 1, fileSize: 100 * 1024 * 1024 },
});

await app.register(websocket);

app.get('/health', async () => ({ ok: true }));
app.get('/ws', { websocket: true }, (socket) => addPeer(socket));

await app.register(configRoutes,    { prefix: '/api' });
await app.register(sourceRoutes,    { prefix: '/api' });
await app.register(importRoutes,    { prefix: '/api' });
await app.register(dashboardRoutes, { prefix: '/api' });
await app.register(testSingleRoute, { prefix: '/api' });

await app.listen({ port: env.API_PORT, host: '0.0.0.0' });