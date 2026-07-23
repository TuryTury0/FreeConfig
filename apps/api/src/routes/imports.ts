import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { splitConfigs } from '../services/config-parser.js';
import { persistConfigs } from '../services/config-store.js';

// Hard cap on uploaded files. Anything above this is almost certainly a mistake
// (or an attack) — the parser walks every line, so we don't want unbounded input.
const MAX_BYTES = 100 * 1024 * 1024;

export async function importRoutes(app: FastifyInstance) {
  // Paste-in flow. Handy for adding a handful of configs by hand.
  app.post('/imports/text', async (req, rep) => {
    const body = z
      .object({ text: z.string().min(1).max(2_000_000) })
      .parse(req.body);

    const parsed = splitConfigs(body.text);
    if (!parsed.length) {
      return rep.code(400).send({ error: 'no_supported_configs' });
    }

    const accepted = await persistConfigs(parsed);
    return {
      total: parsed.length,
      accepted,
      rejected: parsed.length - accepted,
    };
  });

  // File upload flow. We stream the file into memory in chunks and bail out
  // the moment we cross the size limit — no point buffering a 500MB text blob.
  app.post('/imports', async (req, rep) => {
    const file = await req.file({ limits: { fileSize: MAX_BYTES, files: 1 } });
    if (!file) return rep.code(400).send({ error: 'file_required' });

    let text = '';
    for await (const chunk of file.file) {
      text += chunk.toString('utf8');
      if (Buffer.byteLength(text) > MAX_BYTES) {
        return rep.code(413).send({ error: 'file_too_large' });
      }
    }

    const parsed = splitConfigs(text);
    const accepted = await persistConfigs(parsed);

    return {
      filename: file.filename,
      total: parsed.length,
      accepted,
      rejected: parsed.length - accepted,
    };
  });
}