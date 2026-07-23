import { testQueue } from '../lib/queue.js';
import { store } from '../lib/store.js';
import { env } from '../lib/env.js';
import { broadcast } from '../services/broadcast.js';
import { testConfig } from '../services/xray-tester.js';

type JobData = { configId: string };

const countryNames: Record<string, string> = {
  US: 'USA', GB: 'UK', DE: 'Germany', FR: 'France', NL: 'Netherlands',
  CA: 'Canada', JP: 'Japan', SG: 'Singapore', TR: 'Turkey', AE: 'UAE',
  IR: 'Iran', RU: 'Russia', KR: 'Korea', HK: 'HongKong', IN: 'India',
  AU: 'Australia', BR: 'Brazil', SE: 'Sweden', CH: 'Switzerland',
};

async function runJob(data: JobData): Promise<void> {
  const config = store.configs.get(data.configId);
  if (!config) return;

  config.test = { status: 'running', testedAt: new Date().toISOString() };
  broadcast('test.started', { configId: data.configId });

  const outcome = await testConfig(config.uri, { timeoutMs: env.TEST_TIMEOUT_MS, withGeo: false });

  if (outcome.success && outcome.latencyMs !== undefined) {
    const num = store.nextName++;
    const cLabel = outcome.country ? (countryNames[outcome.country] ?? outcome.country) : undefined;
    config.ip = outcome.ip ?? null;
    config.country = outcome.country ?? null;
    config.label = cLabel ? `Anythings-${cLabel}-${num}` : `Anythings-${num}`;
    config.test = {
      status: 'working',
      latencyMs: outcome.latencyMs,
      samples: 1,
      ip: outcome.ip,
      country: outcome.country,
      testedAt: new Date().toISOString(),
    };
    broadcast('test.finished', {
      configId: data.configId,
      status: 'working',
      latencyMs: outcome.latencyMs,
      ip: outcome.ip,
      country: outcome.country,
      uri: config.uri,           // ← send URI so the frontend can copy it live
      label: config.label,
    });
  } else {
    const message = outcome.error ?? 'failed';
    config.test = {
      status: message.includes('timeout') ? 'timeout' : 'failed',
      errorCode: message.slice(0, 120),
      testedAt: new Date().toISOString(),
    };
    broadcast('test.finished', {
      configId: data.configId,
      status: config.test.status,
      errorCode: config.test.errorCode,
    });
  }
}

testQueue.register(runJob);