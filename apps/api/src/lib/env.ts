import { z } from 'zod';
import { existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';

const schema = z.object({
  DATABASE_URL:      z.string().default('postgres://anythings:anythings@localhost:5432/anythings'),
  REDIS_URL:         z.string().default('redis://localhost:6379'),
  API_PORT:          z.coerce.number().default(4000),
  WEB_ORIGIN:        z.string().default('http://localhost:3000'),
  XRAY_BIN:          z.string().default('xray/bin/xray'),
  XRAY_MAX_PARALLEL: z.coerce.number().min(1).max(16).default(4),
  TEST_TIMEOUT_MS:   z.coerce.number().min(1000).max(60000).default(12000),
});

const parsed = schema.parse(process.env);

// Finds the Xray binary regardless of where we're launched from.
// The whole point is that `npm run dev` from the repo root and running the API
// package directly should both just work — and on Windows we need to try
// with and without the .exe suffix.
function resolveXrayBin(input: string): string {
  const isWin = process.platform === 'win32';
  const candidates: string[] = [];

  const withExt = (p: string): string[] => {
    if (!isWin) return [p];
    if (p.toLowerCase().endsWith('.exe')) return [p];
    return [p + '.exe', p];
  };

  if (isAbsolute(input)) {
    candidates.push(...withExt(input));
  } else {
    // Try relative to wherever we were launched from first.
    candidates.push(...withExt(resolve(process.cwd(), input)));
    // Then walk up in case we're inside apps/api and the path is repo-relative.
    candidates.push(...withExt(resolve(process.cwd(), '..', '..', input)));
    candidates.push(...withExt(resolve(process.cwd(), '..', input)));
    // Last resort: the conventional xray/bin/xray location.
    candidates.push(...withExt(resolve(process.cwd(), 'xray', 'bin', 'xray')));
    candidates.push(...withExt(resolve(process.cwd(), '..', '..', 'xray', 'bin', 'xray')));
  }

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  // Nothing matched. Return the first guess so the error message points
  // somewhere useful.
  return candidates[0] ?? input;
}

export const env = {
  ...parsed,
  XRAY_BIN: resolveXrayBin(parsed.XRAY_BIN),
};

console.log(`[env] XRAY_BIN resolved to: ${env.XRAY_BIN} (exists: ${existsSync(env.XRAY_BIN)})`);