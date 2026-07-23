import pg from 'pg';
import { env } from './env.js';

// Only used when someone swaps the in-memory store out for Postgres.
// The local dev flow doesn't touch this at all.
export const db = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
});