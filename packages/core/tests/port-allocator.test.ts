import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { PortAllocator } from '../src/browsers/port-allocator.js';

async function canBindLoopback(port: number): Promise<boolean> {
  const server = createServer();
  return new Promise((resolve) => {
    server.once('error', () => resolve(false));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

describe('port allocator', () => {
  it('keeps two loopback reservations distinct until explicit release', async () => {
    const allocator = new PortAllocator();
    const [first, second] = await Promise.all([allocator.reserve(), allocator.reserve()]);
    try {
      expect(first === second).toBe(false);
      expect(await canBindLoopback(first)).toBe(false);
      expect(await canBindLoopback(second)).toBe(false);
    } finally {
      await allocator.release(first);
      await allocator.release(second);
    }
  });

  it('allows a specifically released loopback port to be reserved again', async () => {
    const allocator = new PortAllocator();
    const port = await allocator.reserve();
    await allocator.release(port);
    const reused = await allocator.reserve(port);
    expect(reused).toBe(port);
    await allocator.release(reused);
  });
});
