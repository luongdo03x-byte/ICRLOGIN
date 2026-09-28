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
