import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { testConfig } from '../services/xray-tester.js';
import { env } from '../lib/env.js';

export async function testSingleRoute(app: FastifyInstance) {
  app.post('/test-single', async (req) => {
    const { uri } = z.object({ uri: z.string().min(5).max(16384) }).parse(req.body);
    return testConfig(uri, { timeoutMs: env.TEST_TIMEOUT_MS, withGeo: true });
  });
}