import { Errors } from './errors.js';

// Every request this server makes is bounded by one deadline, and this is it
// when no caller overrides it. Raised from 10 s to 30 s in issue #18's
// aftermath: a large or busy Jenkins can spend longer than 10 s just loading a
// build record from disk, which surfaces to the caller as this server timing
// out rather than as anything Jenkins said. Overridable per call, and
// configurable process-wide via MCP_JENKINS_TIMEOUT_MS. A caller that still
// wants the old deadline passes timeoutMs per call, or MCP_JENKINS_TIMEOUT_MS=10000.
export const DEFAULT_TIMEOUT_MS = 30000;

export interface HttpClientOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export const httpGetJson = async <T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (res.status === 401) throw Errors.authFailed();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json() as T;
  } catch (e: any) {
    if (e.name === 'AbortError') throw Errors.timeout();
    throw e;
  } finally {
    clearTimeout(t);
  }
};

export const httpGetText = async (url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<string> => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (res.status === 401) throw Errors.authFailed();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e: any) {
    if (e.name === 'AbortError') throw Errors.timeout();
    throw e;
  } finally {
    clearTimeout(t);
  }
};

// Same error shape and deadline handling as httpGetText, but hands the caller
// the response headers alongside the body, for endpoints that speak through
// headers (Jenkins' progressiveText log endpoint reports resume offsets and
// more-data flags that way).
export const httpGetTextWithHeaders = async (
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ text: string; headers: Record<string, string | null> }> => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (res.status === 401) throw Errors.authFailed();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return {
      text: await res.text(),
      headers: Object.fromEntries(res.headers.entries()),
    };
  } catch (e: any) {
    if (e.name === 'AbortError') throw Errors.timeout();
    throw e;
  } finally {
    clearTimeout(t);
  }
};

export const httpPost = async (url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ status: number; headers: Record<string, string | null> }> => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', ...init, signal: controller.signal });
    if (res.status === 401) throw Errors.authFailed();
    return { status: res.status, headers: Object.fromEntries(res.headers.entries()) };
  } catch (e: any) {
    if (e.name === 'AbortError') throw Errors.timeout();
    throw e;
  } finally { clearTimeout(t); }
};

export const httpGetBuffer = async (url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Buffer> => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (res.status === 401) throw Errors.authFailed();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (e: any) {
    if (e.name === 'AbortError') throw Errors.timeout();
    throw e;
  } finally { clearTimeout(t); }
};
