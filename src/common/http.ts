import { Errors } from './errors.js';

export interface HttpClientOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export const httpGetJson = async <T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), init.timeoutMs ?? 10000);
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
  const t = setTimeout(() => controller.abort(), init.timeoutMs ?? 10000);
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

export const httpPost = async (url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ status: number; headers: Record<string, string | null> }> => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), init.timeoutMs ?? 10000);
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
  const t = setTimeout(() => controller.abort(), init.timeoutMs ?? 10000);
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
