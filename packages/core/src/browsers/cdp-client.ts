import { AppError } from '@icrlogin/shared';

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason ?? new Error('Aborted')); return; }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error('Aborted'));
    }, { once: true });
  });
}

function parseWebSocketDebuggerUrl(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = (value as { webSocketDebuggerUrl?: unknown }).webSocketDebuggerUrl;
  if (typeof candidate !== 'string') return null;
  try {
    const url = new URL(candidate);
    return url.protocol === 'ws:' || url.protocol === 'wss:' ? candidate : null;
  } catch {
    return null;
  }
}

export async function waitForCdp(baseUrl: string, timeoutMs: number, signal: AbortSignal): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (signal.aborted) throw signal.reason ?? new Error('Aborted');
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/json/version`, { signal });
      if (response.ok) {
        const websocket = parseWebSocketDebuggerUrl(await response.json());
        if (websocket) return websocket;
      }
    } catch (error) {
      if (signal.aborted) throw signal.reason ?? error;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(25, remaining), signal);
  }
  throw new AppError('CDP_TIMEOUT', `CDP did not become ready within ${timeoutMs}ms`);
}

type CdpPending = { resolve(value: unknown): void; reject(error: unknown): void };
type CdpEventListener = (params: any, sessionId?: string) => void;

export class CdpConnection {
  private socket: WebSocket | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, CdpPending>();
  private readonly listeners = new Map<string, Set<CdpEventListener>>();

  constructor(private readonly webSocketUrl: string) {}

  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    const url = new URL(this.webSocketUrl);
    if ((url.protocol !== 'ws:' && url.protocol !== 'wss:') || url.hostname !== '127.0.0.1') {
      throw new AppError('INTERNAL_ERROR', 'CDP connection is restricted to localhost');
    }
    const socket = new WebSocket(this.webSocketUrl);
    this.socket = socket;
    socket.addEventListener('message', (event) => this.handleMessage(event.data));
    socket.addEventListener('close', () => this.handleClose());
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error('Unable to connect to CDP')); };
      const cleanup = () => {
        socket.removeEventListener('open', onOpen);
        socket.removeEventListener('error', onError);
      };
      socket.addEventListener('open', onOpen, { once: true });
      socket.addEventListener('error', onError, { once: true });
    });
  }

  async send<T = unknown>(method: string, params?: unknown, sessionId?: string): Promise<T> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('CDP socket is not connected');
    const id = this.nextId++;
    const payload: Record<string, unknown> = { id, method };
    if (params !== undefined) payload.params = params;
    if (sessionId !== undefined) payload.sessionId = sessionId;
    const result = new Promise<T>((resolve, reject) => this.pending.set(id, { resolve: (value) => resolve(value as T), reject }));
    socket.send(JSON.stringify(payload));
    return result;
  }

  on(method: string, listener: CdpEventListener): () => void {
    const set = this.listeners.get(method) ?? new Set<CdpEventListener>();
    set.add(listener);
    this.listeners.set(method, set);
    return () => set.delete(listener);
  }

  close(): void {
    try { this.socket?.close(); } catch { /* best effort */ }
    this.socket = null;
    this.handleClose();
  }

  private handleMessage(data: unknown): void {
    let message: any;
    try {
      const text = typeof data === 'string' ? data : data instanceof ArrayBuffer ? Buffer.from(data).toString('utf8') : String(data);
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? 'CDP command failed'));
      else pending.resolve(message.result ?? {});
      return;
    }
    if (typeof message.method === 'string') {
      for (const listener of this.listeners.get(message.method) ?? []) {
        try { listener(message.params ?? {}, message.sessionId); } catch { /* event listener isolation */ }
      }
    }
  }

  private handleClose(): void {
    for (const pending of this.pending.values()) pending.reject(new Error('CDP connection closed'));
    this.pending.clear();
  }
}

export async function closeBrowserOverCdp(webSocketUrl: string, timeoutMs = 1_000): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(webSocketUrl);
  } catch {
    throw new AppError('INTERNAL_ERROR', 'Invalid browser CDP websocket URL');
  }
  if (parsed.protocol !== 'ws:' || parsed.hostname !== '127.0.0.1') {
    throw new AppError('INTERNAL_ERROR', 'Browser close is restricted to localhost CDP');
  }

  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    let opened = false;
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      try { socket.close(); } catch { /* best effort */ }
      finish(new AppError('INTERNAL_ERROR', `Browser.close did not complete within ${timeoutMs}ms`));
    }, timeoutMs);

    socket.addEventListener('open', () => {
      opened = true;
      socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    }, { once: true });
    socket.addEventListener('close', () => finish(), { once: true });
    socket.addEventListener('error', () => {
      if (!opened) finish(new AppError('INTERNAL_ERROR', 'Unable to connect to browser CDP for close'));
    }, { once: true });
  });
}
