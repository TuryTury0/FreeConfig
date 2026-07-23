import { syncQueue } from '../lib/queue.js';
import { syncSource } from '../services/source-sync.js';

// Nothing exciting here — the queue drives everything. We just wire the
// handler on module import so `syncQueue.add(...)` from a route actually runs.
syncQueue.register(async ({ sourceId }) => syncSource(sourceId));