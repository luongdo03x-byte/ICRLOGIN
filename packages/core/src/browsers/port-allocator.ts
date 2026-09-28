import { createServer, type Server } from 'node:net';
import { AppError } from '@icrlogin/shared';

export class PortAllocator {
  private readonly reservations = new Map<number, Server>();

  async reserve(preferredPort = 0): Promise<number> {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen({ host: '127.0.0.1', port: preferredPort, exclusive: true }, resolve);
    }).catch((error) => {
      try { server.close(); } catch { /* unopened server */ }
      throw new AppError('PORT_UNAVAILABLE', `Unable to reserve local port ${preferredPort || 'auto'}`,
        { cause: error instanceof Error ? error.message : String(error) });
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      throw new AppError('PORT_UNAVAILABLE', 'Unable to determine reserved local port');
    }
    this.reservations.set(address.port, server);
    return address.port;
  }

  async release(port: number): Promise<void> {
    const server = this.reservations.get(port);
    if (!server) return;
    this.reservations.delete(port);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}
