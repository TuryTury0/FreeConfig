import { createHash } from 'node:crypto';

const PROTOCOLS = new Set([
  'vless', 'vmess', 'trojan', 'ss', 'ssr',
  'hy', 'hysteria', 'hysteria2',
  'socks', 'socks5',
  'http', 'https',
]);

export type ParsedConfig = {
  uri:         string;
  fingerprint: string;
  protocol:    string;
  host:        string | null;
  port:        number | null;
  label:       string | null;
};

const CTRL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

// Turns a raw line into a normalized config record, or returns null if the
// line doesn't look like something we can work with. We're lenient — as long
// as we can figure out the scheme, we'll keep it around even if the rest of
// the URI is oddly formatted.
export function parseConfig(raw: string): ParsedConfig | null {
  const uri = raw.trim();

  if (uri.length < 5 || uri.length > 16_384) return null;
  if (CTRL_RE.test(uri)) return null;

  const match = /^([a-zA-Z0-9+.-]+):\/\//.exec(uri);
  if (!match) return null;

  const protocol = match[1].toLowerCase();
  if (!PROTOCOLS.has(protocol)) return null;

  let host:  string | null = null;
  let port:  number | null = null;
  let label: string | null = null;

  try {
    if (protocol === 'vmess') {
      // VMess URIs aren't real URLs — the payload is base64 JSON.
      try {
        const b64  = uri.slice('vmess://'.length);
        const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as {
          add?: string; port?: string | number; ps?: string;
        };
        host  = json.add  ?? null;
        port  = json.port ? Number(json.port) : null;
        label = json.ps   ?? null;
      } catch { /* leave the fields null and move on */ }
    } else if (['ss', 'ssr'].includes(protocol)) {
      // Shadowsocks: ss://BASE64@host:port#label or ss://BASE64#label
      try {
        const noScheme = uri.slice(protocol.length + 3);
        const hashIdx  = noScheme.indexOf('#');
        label = hashIdx >= 0 ? decodeURIComponent(noScheme.slice(hashIdx + 1)).slice(0, 180) : null;
        const atIdx = noScheme.lastIndexOf('@');
        if (atIdx >= 0) {
          const hostPort = noScheme.slice(atIdx + 1, hashIdx >= 0 ? hashIdx : undefined);
          const colonIdx = hostPort.lastIndexOf(':');
          host = colonIdx >= 0 ? hostPort.slice(0, colonIdx) : hostPort;
          port = colonIdx >= 0 ? Number(hostPort.slice(colonIdx + 1)) : null;
        }
      } catch { /* leave the fields null and move on */ }
    } else {
      const u = new URL(uri);
      host  = u.hostname || null;
      port  = u.port ? Number(u.port) : null;
      label = u.hash ? decodeURIComponent(u.hash.slice(1)).slice(0, 180) || null : null;
    }
  } catch {
    // The URI wasn't parseable, but we still want to keep it — search and
    // export don't need the metadata to work.
  }

  const validPort = port !== null && port > 0 && port <= 65535 ? port : null;

  return {
    uri,
    fingerprint: createHash('sha256').update(uri).digest('hex'),
    protocol,
    host,
    port: validPort,
    label,
  };
}

export function splitConfigs(text: string): ParsedConfig[] {
  return text
    .split(/[\r\n]+/)
    .map(line => parseConfig(line.trim()))
    .filter((v): v is ParsedConfig => v !== null);
}