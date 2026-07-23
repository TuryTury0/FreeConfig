import { randomUUID } from 'node:crypto';

export type ConfigRecord = {
  id:          string;
  fingerprint: string;
  uri:         string;
  protocol:    string;
  host:        string | null;
  port:        number | null;
  label:       string | null;
  country:     string | null;
  ip:          string | null;
  sourceId:    string | null;
  lastSeenAt:  string;
  test?:       TestRecord;
};

export type TestRecord = {
  status:     'queued' | 'running' | 'working' | 'failed' | 'timeout';
  latencyMs?: number;
  samples?:   number;
  ip?:        string;
  country?:   string;
  speedBps?:  number;
  errorCode?: string;
  testedAt:   string;
};

export type Source = {
  id:            string;
  name:          string;
  url:           string;
  enabled:       boolean;
  lastSyncedAt:  string | null;
  lastError:     string | null;
  configCount:   number;
};

export type TestSettings = {
  targetId:  string;
  host:      string;
  port:      number;
  samples:   number;
  timeoutMs: number;
};

export const targets = [
  { id: 'cloudflare', label: 'Cloudflare — 1.1.1.1:443',  host: '1.1.1.1', port: 443 },
  { id: 'google',     label: 'Google DNS — 8.8.8.8:443',   host: '8.8.8.8', port: 443 },
  { id: 'quad9',      label: 'Quad9 — 9.9.9.9:443',        host: '9.9.9.9', port: 443 },
] as const;

class Store {
  nextName    = 1;
  settings: TestSettings = {
    targetId:  'cloudflare',
    host:      '1.1.1.1',
    port:      443,
    samples:   3,
    timeoutMs: 5000,
  };
  configs      = new Map<string, ConfigRecord>();
  byFingerprint = new Map<string, string>();
  sources      = new Map<string, Source>();

  constructor() {
    const id = randomUUID();
    this.sources.set(id, {
      id,
      name:          'TUry / Config',
      url:           'https://raw.githubusercontent.com/TuryTury0/Config/main/config.txt',
      enabled:       true,
      lastSyncedAt:  null,
      lastError:     null,
      configCount:   0,
    });
  }
}

export const store = new Store();