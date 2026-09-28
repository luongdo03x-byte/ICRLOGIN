export type ProxyFormType = 'http' | 'https' | 'socks5';

export interface ProxyFormState {
  name: string;
  type: ProxyFormType;
  host: string;
  port: string;
  username: string;
  password: string;
}

export type ProxyFormResult =
  | { ok: true; value: { name: string; type: ProxyFormType; host: string; port: number; username?: string | null; password?: string | null } }
  | { ok: false; message: string };

export function validateProxyPort(value: string): { ok: true; value: number } | { ok: false; message: string } {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, message: 'Port must be between 1 and 65535' };
  return { ok: true, value: port };
}

export function buildProxySubmitInput(form: ProxyFormState, editing: boolean): ProxyFormResult {
  const name = form.name.trim();
  const host = form.host.trim();
  if (!name) return { ok: false, message: 'Proxy name is required' };
  if (!host) return { ok: false, message: 'Host is required' };
  const port = validateProxyPort(form.port);
  if (!port.ok) return port;
  const value: { name: string; type: ProxyFormType; host: string; port: number; username?: string | null; password?: string | null } = { name, type: form.type, host, port: port.value };
  const username = form.username.trim();
  if (username) value.username = username;
  else value.username = null;
  if (form.password.length > 0) value.password = form.password;
  else if (!editing) value.password = null;
  return { ok: true, value };
}
