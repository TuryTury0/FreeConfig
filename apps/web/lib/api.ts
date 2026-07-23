export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Small typed wrapper around fetch. Every SWR key in the app flows through
// this so we get consistent no-cache behavior and error handling in one place.
export async function api<T>(path: string): Promise<T> {
  const r = await fetch(`${API}/api${path}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('Request failed');
  return r.json();
}