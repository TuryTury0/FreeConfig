import { spawn, ChildProcess } from 'node:child_process';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import { env } from '../lib/env.js';

// Builds the outbound config for VLESS. Supports TLS, Reality, and the usual
// transports (tcp, ws, grpc, h2). Most of the tricky parts here come from
// Reality — we always pass fingerprint even when the user didn't set one,
// otherwise Xray complains.
function buildVlessOutbound(u: URL) {
  const security = u.searchParams.get('security') || 'none';
  const network = u.searchParams.get('type') || 'tcp';
  const sni = u.searchParams.get('sni') || u.hostname;
  const fp = u.searchParams.get('fp') || '';
  const pbk = u.searchParams.get('pbk') || '';
  const sid = u.searchParams.get('sid') || '';
  const flow = u.searchParams.get('flow') || '';
  const path_ = u.searchParams.get('path') ? decodeURIComponent(u.searchParams.get('path')!) : '/';
  const host = u.searchParams.get('host') || u.hostname;
  const serviceName = u.searchParams.get('serviceName') || '';
  const alpn = u.searchParams.get('alpn') || '';
  const allowInsecure = u.searchParams.get('allowInsecure') === '1' || u.searchParams.get('insecure') === '1';

  const stream: Record<string, unknown> = { network, security };

  if (security === 'tls') {
    stream.tlsSettings = {
      serverName: sni, allowInsecure,
      ...(fp ? { fingerprint: fp } : {}),
      ...(alpn ? { alpn: alpn.split(',') } : {}),
    };
  } else if (security === 'reality') {
    stream.realitySettings = {
      serverName: sni, fingerprint: fp || 'chrome',
      publicKey: pbk, shortId: sid, spiderX: u.searchParams.get('spx') || '',
    };
  }

  if (network === 'ws') stream.wsSettings = { path: path_, host };
  else if (network === 'grpc') stream.grpcSettings = { serviceName };
  else if (network === 'h2') stream.httpSettings = { path: path_, host: [host] };
  else if (network === 'tcp' && u.searchParams.get('headerType') === 'http') {
    stream.tcpSettings = { header: { type: 'http', request: { path: [path_], headers: { Host: [host] } } } };
  }

  return {
    protocol: 'vless', tag: 'proxy',
    settings: {
      vnext: [{
        address: u.hostname, port: Number(u.port || 443),
        users: [{ id: u.username, encryption: 'none', ...(flow ? { flow } : {}) }],
      }],
    },
    streamSettings: stream,
  };
}

// Trojan works almost like VLESS but the password sits in the username slot
// of the URI. Keep an eye on decodeURIComponent — some passwords have %-encoding.
function buildTrojanOutbound(u: URL) {
  const security = u.searchParams.get('security') || 'tls';
  const network = u.searchParams.get('type') || 'tcp';
  const sni = u.searchParams.get('sni') || u.hostname;
  const fp = u.searchParams.get('fp') || '';
  const path_ = u.searchParams.get('path') ? decodeURIComponent(u.searchParams.get('path')!) : '/';
  const host = u.searchParams.get('host') || u.hostname;
  const serviceName = u.searchParams.get('serviceName') || '';
  const allowInsecure = u.searchParams.get('allowInsecure') === '1' || u.searchParams.get('insecure') === '1';

  const stream: Record<string, unknown> = { network, security };
  if (security === 'tls') stream.tlsSettings = { serverName: sni, allowInsecure, ...(fp ? { fingerprint: fp } : {}) };
  else if (security === 'reality') {
    stream.realitySettings = {
      serverName: sni, fingerprint: fp || 'chrome',
      publicKey: u.searchParams.get('pbk') || '', shortId: u.searchParams.get('sid') || '',
    };
  }
  if (network === 'ws') stream.wsSettings = { path: path_, host };
  else if (network === 'grpc') stream.grpcSettings = { serviceName };

  return {
    protocol: 'trojan', tag: 'proxy',
    settings: {
      servers: [{
        address: u.hostname, port: Number(u.port || 443),
        password: decodeURIComponent(u.username),
      }],
    },
    streamSettings: stream,
  };
}

// VMess URIs are base64-encoded JSON blobs, not real URLs.
// We decode the payload and translate the field names Xray expects.
function buildVmessOutbound(uri: string) {
  const raw = uri.replace(/^vmess:\/\//, '');
  const json = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as Record<string, string | number>;
  const add = String(json.add || ''), port = Number(json.port || 443);
  const id = String(json.id || ''), aid = Number(json.aid || 0);
  const network = String(json.net || 'tcp'), tlsVal = String(json.tls || '');
  const sni = String(json.sni || add), path_ = String(json.path || '/');
  const host = String(json.host || add), fp = String(json.fp || '');

  const stream: Record<string, unknown> = { network, security: tlsVal === 'tls' ? 'tls' : 'none' };
  if (tlsVal === 'tls') stream.tlsSettings = { serverName: sni, allowInsecure: false, ...(fp ? { fingerprint: fp } : {}) };
  if (network === 'ws') stream.wsSettings = { path: path_, host };
  else if (network === 'grpc') stream.grpcSettings = { serviceName: String(json.serviceName || '') };

  return {
    protocol: 'vmess', tag: 'proxy',
    settings: { vnext: [{ address: add, port, users: [{ id, alterId: aid, security: 'auto' }] }] },
    streamSettings: stream,
  };
}

function buildSocksOutbound(u: URL) {
  const users = u.username ? [{ user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password) }] : [];
  return {
    protocol: 'socks', tag: 'proxy',
    settings: { servers: [{ address: u.hostname, port: Number(u.port || 1080), ...(users.length ? { users } : {}) }] },
  };
}

function buildHttpOutbound(u: URL, protocol: string) {
  const users = u.username ? [{ user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password) }] : [];
  return {
    protocol: 'http', tag: 'proxy',
    settings: { servers: [{ address: u.hostname, port: Number(u.port || (protocol === 'https' ? 443 : 80)), ...(users.length ? { users } : {}) }] },
  };
}

// Shadowsocks URIs come in two flavors: legacy (whole thing is base64) and
// the newer SIP002 form (userinfo is base64, host part is plain).
// We handle both and fall back to sensible defaults where fields are missing.
function buildShadowsocksOutbound(uri: string) {
  const noScheme = uri.slice(5);
  const hashIdx = noScheme.indexOf('#');
  const main = hashIdx >= 0 ? noScheme.slice(0, hashIdx) : noScheme;
  let method = 'aes-256-gcm', password = '', address = '', port = 443;
  const atIdx = main.lastIndexOf('@');
  if (atIdx >= 0) {
    const userPart = main.slice(0, atIdx), hostPart = main.slice(atIdx + 1);
    let decoded: string;
    try { decoded = Buffer.from(userPart, 'base64').toString('utf8'); } catch { decoded = decodeURIComponent(userPart); }
    const colonIdx = decoded.indexOf(':');
    if (colonIdx >= 0) { method = decoded.slice(0, colonIdx); password = decoded.slice(colonIdx + 1); } else password = decoded;
    const lastColon = hostPart.lastIndexOf(':');
    if (lastColon >= 0) { address = hostPart.slice(0, lastColon); port = Number(hostPart.slice(lastColon + 1)) || 443; } else address = hostPart;
  } else {
    let decoded: string;
    try { decoded = Buffer.from(main, 'base64').toString('utf8'); } catch { decoded = main; }
    const atIdx2 = decoded.lastIndexOf('@');
    if (atIdx2 >= 0) {
      const userPart = decoded.slice(0, atIdx2), hostPart = decoded.slice(atIdx2 + 1);
      const colonIdx = userPart.indexOf(':');
      method = colonIdx >= 0 ? userPart.slice(0, colonIdx) : 'aes-256-gcm';
      password = colonIdx >= 0 ? userPart.slice(colonIdx + 1) : userPart;
      const lastColon = hostPart.lastIndexOf(':');
      address = lastColon >= 0 ? hostPart.slice(0, lastColon) : hostPart;
      port = lastColon >= 0 ? Number(hostPart.slice(lastColon + 1)) || 443 : 443;
    }
  }
  return { protocol: 'shadowsocks', tag: 'proxy', settings: { servers: [{ address, port, method, password }] } };
}

function makeXrayConfig(uri: string, socksPort: number) {
  const proto = /^([a-zA-Z0-9+.-]+):\/\//.exec(uri)?.[1]?.toLowerCase() ?? '';
  let outbound: Record<string, unknown>;
  if (proto === 'vmess') outbound = buildVmessOutbound(uri);
  else if (proto === 'ss') outbound = buildShadowsocksOutbound(uri);
  else {
    const u = new URL(uri);
    switch (proto) {
      case 'vless':  outbound = buildVlessOutbound(u); break;
      case 'trojan': outbound = buildTrojanOutbound(u); break;
      case 'socks':
      case 'socks5': outbound = buildSocksOutbound(u); break;
      case 'http':
      case 'https':  outbound = buildHttpOutbound(u, proto); break;
      default: throw new Error(`unsupported_protocol:${proto}`);
    }
  }
  return {
    log: { loglevel: 'error' },
    inbounds: [{ listen: '127.0.0.1', port: socksPort, protocol: 'socks', settings: { auth: 'noauth', udp: false }, sniffing: { enabled: false } }],
    outbounds: [outbound, { protocol: 'freedom', tag: 'direct' }],
  };
}

// Grab a random free port from the OS so we don't collide with anything.
function getFreePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => res(addr.port));
    });
    srv.on('error', rej);
  });
}

const pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// Quick TCP reachability probe. If we can't even open a socket to the proxy
// server, there's no point spawning Xray — bail out early.
function tcpPing(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createConnection({ host, port });
    const t = setTimeout(() => { s.destroy(); resolve(false); }, timeoutMs);
    s.once('connect', () => { clearTimeout(t); s.destroy(); resolve(true); });
    s.once('error', () => { clearTimeout(t); resolve(false); });
  });
}

// Xray needs a moment to boot before its SOCKS listener is ready to accept.
// Poll the port every 50ms until it responds, or give up.
async function waitForPort(port: number, maxMs = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const ok = await new Promise<boolean>((res) => {
      const s = net.createConnection({ host: '127.0.0.1', port });
      const t = setTimeout(() => { s.destroy(); res(false); }, 200);
      s.once('connect', () => { clearTimeout(t); s.destroy(); res(true); });
      s.once('error', () => { clearTimeout(t); res(false); });
    });
    if (ok) return;
    await pause(50);
  }
  throw new Error('xray_port_timeout');
}

// Manual SOCKS5 client. We could use a library but this is short enough
// and we want tight control over timeouts.
function socks5Connect(localPort: number, destHost: string, destPort: number, timeoutMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err?: Error) => {
      if (done) return; done = true;
      clearTimeout(timer);
      if (err) { socket.destroy(); reject(err); } else resolve(socket);
    };
    const socket = net.createConnection({ host: '127.0.0.1', port: localPort });
    socket.setTimeout(timeoutMs);
    const timer = setTimeout(() => finish(new Error('socks5_timeout')), timeoutMs);
    let stage = 0, buf = Buffer.alloc(0);
    socket.once('connect', () => socket.write(Buffer.from([0x05, 0x01, 0x00])));
    socket.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      try {
        if (stage === 0) {
          if (buf.length < 2) return;
          if (buf[0] !== 0x05 || buf[1] !== 0x00) throw new Error('socks5_handshake');
          buf = buf.subarray(2); stage = 1;
          const hostBuf = Buffer.from(destHost, 'utf8');
          const req = Buffer.allocUnsafe(7 + hostBuf.length);
          req[0] = 0x05; req[1] = 0x01; req[2] = 0x00; req[3] = 0x03;
          req[4] = hostBuf.length;
          hostBuf.copy(req, 5);
          req.writeUInt16BE(destPort, 5 + hostBuf.length);
          socket.write(req);
        } else if (stage === 1) {
          if (buf.length < 4) return;
          if (buf[1] !== 0x00) throw new Error(`socks5_refused_${buf[1]}`);
          // Reply length depends on the address type Xray sends back.
          let replyLen = 4;
          if (buf[3] === 0x01) replyLen += 6;
          else if (buf[3] === 0x03) replyLen += 1 + (buf[4] ?? 0) + 2;
          else if (buf[3] === 0x04) replyLen += 18;
          else replyLen += 6;
          if (buf.length < replyLen) return;
          stage = 2;
          socket.removeAllListeners('data');
          finish();
        }
      } catch (e) { finish(e instanceof Error ? e : new Error('socks5_err')); }
    });
    socket.on('timeout', () => finish(new Error('socks5_socket_timeout')));
    socket.on('error', (e) => finish(e));
    socket.on('close', () => { if (stage < 2) finish(new Error('socks5_closed')); });
  });
}

// Fires an HTTPS request through the SOCKS proxy and measures the round trip.
// Kept small on purpose — we abort once we get enough bytes for the status line.
function httpsGet(localPort: number, host: string, path: string, timeoutMs: number)
  : Promise<{ latency: number; body: string; statusCode: number }> {
  const started = Date.now();
  return socks5Connect(localPort, host, 443, timeoutMs).then(
    (raw) => new Promise((resolve, reject) => {
      let done = false, body = '';
      const remaining = Math.max(timeoutMs - (Date.now() - started), 2000);
      const timer = setTimeout(() => end(new Error('tls_timeout')), remaining);
      const end = (err?: Error) => {
        if (done) return; done = true;
        clearTimeout(timer);
        try { secure.destroy(); } catch {}
        try { raw.destroy(); } catch {}
        if (err) reject(err);
        else {
          const m = /HTTP\/[\d.]+ (\d+)/.exec(body);
          resolve({ latency: Date.now() - started, body, statusCode: m ? Number(m[1]) : 0 });
        }
      };
      const secure = tls.connect({
        socket: raw,
        servername: host,
        rejectUnauthorized: false,
        ALPNProtocols: ['http/1.1'],
      });
      secure.once('secureConnect', () => {
        secure.write(`GET ${path} HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: Mozilla/5.0\r\nAccept: */*\r\nConnection: close\r\n\r\n`);
      });
      secure.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8');
        if (body.length > 2048) end();
      });
      secure.on('end', () => end());
      secure.on('error', (e) => end(e));
      raw.on('error', (e) => end(e));
    }),
  );
}

// Pulls the actual proxy host and port out of a config URI. Used for the
// pre-check so we can skip dead endpoints without spinning up Xray.
function extractEndpoint(uri: string): { host: string; port: number } | null {
  const proto = /^([a-zA-Z0-9+.-]+):\/\//.exec(uri)?.[1]?.toLowerCase() ?? '';
  try {
    if (proto === 'vmess') {
      const raw = uri.replace(/^vmess:\/\//, '');
      const json = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as { add?: string; port?: string | number };
      return json.add ? { host: String(json.add), port: Number(json.port || 443) } : null;
    }
    if (proto === 'ss') {
      const noScheme = uri.slice(5);
      const hashIdx = noScheme.indexOf('#');
      const main = hashIdx >= 0 ? noScheme.slice(0, hashIdx) : noScheme;
      const atIdx = main.lastIndexOf('@');
      if (atIdx < 0) return null;
      const hostPart = main.slice(atIdx + 1);
      const lastColon = hostPart.lastIndexOf(':');
      if (lastColon < 0) return null;
      return { host: hostPart.slice(0, lastColon), port: Number(hostPart.slice(lastColon + 1)) || 443 };
    }
    const u = new URL(uri);
    if (!u.hostname) return null;
    return { host: u.hostname, port: Number(u.port || 443) };
  } catch { return null; }
}

export type TestOutcome = {
  success: boolean;
  latencyMs?: number;
  ip?: string;
  country?: string;
  error?: string;
  xrayLog?: string;
};

export type TestOptions = {
  timeoutMs?: number;
  withGeo?: boolean;
};

// The main entry point. Given a config URI, spin up an isolated Xray instance,
// prove it can actually reach the internet, and clean everything up.
export async function testConfig(uri: string, opts: TestOptions = {}): Promise<TestOutcome> {
  const timeoutMs = opts.timeoutMs ?? env.TEST_TIMEOUT_MS;
  const withGeo = opts.withGeo ?? false;

  const binary = env.XRAY_BIN;
  try { await access(binary); }
  catch { return { success: false, error: `xray_not_found:${binary}` }; }

  // Skip the whole Xray dance if the server itself isn't answering.
  const endpoint = extractEndpoint(uri);
  if (endpoint) {
    const reachable = await tcpPing(endpoint.host, endpoint.port, 3000);
    if (!reachable) return { success: false, error: 'endpoint_unreachable' };
  }

  const root = await mkdtemp(join(tmpdir(), 'ax-'));
  const configPath = join(root, 'c.json');
  let child: ChildProcess | undefined;

  try {
    const port = await getFreePort();
    let cfg: Record<string, unknown>;
    try { cfg = makeXrayConfig(uri, port); }
    catch (e) { return { success: false, error: `config_build:${e instanceof Error ? e.message : 'x'}` }; }

    await writeFile(configPath, JSON.stringify(cfg), { mode: 0o600 });

    let xrayLog = '';
    child = spawn(binary, ['run', '-c', configPath], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    child.stdout?.on('data', (d: Buffer) => { xrayLog += d.toString().slice(0, 1024); });
    child.stderr?.on('data', (d: Buffer) => { xrayLog += d.toString().slice(0, 1024); });
    child.on('error', (e) => { xrayLog += `\n[spawn]${e.message}`; });

    try { await waitForPort(port, 3000); }
    catch { return { success: false, error: 'xray_not_ready', xrayLog: xrayLog.slice(-800) }; }

    // Xray reports ready before its outbound is fully wired. A short pause
    // avoids the "first request always times out" surprise.
    await pause(200);

    // Try a few well-known lightweight endpoints. First one that responds wins.
    const probes: Array<{ host: string; path: string }> = [
      { host: 'www.cloudflare.com', path: '/cdn-cgi/trace' },
      { host: 'www.gstatic.com',    path: '/generate_204' },
      { host: 'cp.cloudflare.com',  path: '/generate_204' },
    ];

    let latency = 0, ok = false, lastErr = '';
    for (const p of probes) {
      try {
        const r = await httpsGet(port, p.host, p.path, timeoutMs);
        if (r.statusCode > 0 && r.statusCode < 500) {
          latency = r.latency;
          ok = true;
          break;
        }
        lastErr = `${p.host}:status_${r.statusCode}`;
      } catch (e) {
        lastErr = `${p.host}:${e instanceof Error ? e.message : 'err'}`;
      }
    }

    if (!ok) return { success: false, error: lastErr || 'no_probe', xrayLog: xrayLog.slice(-800) };

    // Grab IP and country when the caller wants it. Failure here is fine —
    // the test itself already succeeded.
    let ip: string | undefined, country: string | undefined;
    if (withGeo) {
      try {
        const geo = await httpsGet(port, 'api.country.is', '/', 6000);
        const jsonStr = geo.body.split('\r\n\r\n').at(-1) ?? '{}';
        const parsed = JSON.parse(jsonStr) as { ip?: string; country?: string };
        ip = parsed.ip; country = parsed.country;
      } catch { /* not fatal */ }
    }

    return { success: true, latencyMs: latency, ip, country };

  } finally {
    if (child && !child.killed) child.kill('SIGKILL');
    await pause(50);
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}