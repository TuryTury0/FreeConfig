import type { WebSocket } from 'ws';

// Every connected browser tab lives in this set. The API pushes test lifecycle
// events (started / finished / etc) so the dashboard can update without polling.
const peers = new Set<WebSocket>();

export function addPeer(peer: WebSocket): void {
  peers.add(peer);
  peer.on('close', () => peers.delete(peer));
}

export function broadcast(event: string, data: unknown): void {
  const message = JSON.stringify({ event, data });
  for (const p of peers) {
    if (p.readyState === p.OPEN) p.send(message);
  }
}