const SENSITIVE_KEY = /(password|passwd|secret|token|authorization|cookie|userdatadir|executablepath|sourcepath)/i;
export function redactForLog(value: unknown, maxFieldLength = 4096, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return value.length > maxFieldLength ? value.slice(0, maxFieldLength) : value;
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactForLog(item, maxFieldLength, seen));
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
    result[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactForLog(item, maxFieldLength, seen);
  }
  return result;
}
