'use client';

/** Browser client for the console's same-origin proxy (/api/... -> /superadmin/console/...). */
export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly body?: unknown) { super(message); }
}

function messageOf(body: any, status: number): string {
  const m = body?.message;
  if (Array.isArray(m)) return m.join('. ');
  if (typeof m === 'string') return m;
  if (status === 401) return 'Please sign in again';
  if (status === 403) return 'Developer access only';
  if (status === 404) return 'Not found';
  if (status === 429) return 'Too many attempts, wait a minute';
  return 'Something went wrong. Try again';
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) { headers.set('content-type', 'application/json'); body = JSON.stringify(init.json); }
  const r = await fetch(`/api${path}`, { ...init, headers, body, credentials: 'same-origin' });
  if (r.status === 401 && typeof window !== 'undefined' && !location.pathname.startsWith('/login')) {
    location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
  }
  if (r.status === 204) return undefined as T;
  const text = await r.text();
  const data = text ? safeJson(text) : null;
  if (!r.ok) throw new ApiError(r.status, messageOf(data, r.status), data);
  return data as T;
}
const safeJson = (t: string) => { try { return JSON.parse(t); } catch { return t; } };

/** Photos straight to storage: presign -> PUT -> complete -> wait for READY. */
export async function uploadImages(storeId: string, files: File[], kind = 'product', onProgress?: (done: number, total: number, phase: string) => void) {
  const out: any[] = [];
  for (let i = 0; i < files.length; i += 50) {
    const batch = files.slice(i, i + 50);
    const pre = await api<{ files: Array<{ id: string; uploadUrl: string; headers: Record<string, string> }> }>(`/stores/${storeId}/media/presign`, {
      method: 'POST', json: { files: batch.map((f) => ({ filename: f.name, contentType: f.type, size: f.size, kind })) },
    });
    let done = 0;
    await Promise.all(pre.files.map(async (p, j) => {
      const r = await fetch(p.uploadUrl, { method: 'PUT', headers: p.headers, body: batch[j] });
      if (!r.ok) throw new ApiError(r.status, `Could not upload ${batch[j].name}`);
      onProgress?.(i + ++done, files.length, 'Uploading');
    }));
    const ids = pre.files.map((p) => p.id);
    const res = await api<{ results: Array<{ id: string; status: string; reason?: string }> }>(`/stores/${storeId}/media/complete`, { method: 'POST', json: { ids } });
    const bad = res.results.find((r) => r.status === 'FAILED' || r.status === 'NOT_FOUND');
    if (bad) throw new ApiError(400, bad.reason ?? 'Upload failed');
    for (const id of ids) {
      for (let k = 0; k < 60; k++) {
        const m = await api(`/stores/${storeId}/media/${id}`);
        if (m.status === 'READY' || m.status === 'FAILED') { out.push(m); break; }
        await new Promise((r) => setTimeout(r, 700));
      }
      onProgress?.(out.length, files.length, 'Processing');
    }
  }
  return out;
}
