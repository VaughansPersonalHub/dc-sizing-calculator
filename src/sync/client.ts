// Thin HTTP client around fetch. Same-origin only — Cloudflare Access
// issues a session cookie for calc.scconnect.co.nz that must ride along
// with every /api request, so we always send credentials.
//
// In local dev (vite :5173 → wrangler :8788), configure Vite's server.proxy
// to forward /api to wrangler. The client doesn't care — it always hits
// the same origin.

import { ApiError, ConflictError, type ApiErrorBody } from './types';

const API_BASE = '/api';

async function parseError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody | null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  const code = body?.error?.code ?? 'unknown';
  const message = body?.error?.message ?? res.statusText;
  if (res.status === 409 && body) return new ConflictError(body);
  return new ApiError(res.status, code, message, body);
}

export async function apiJson<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function apiGetBlob(
  path: string
): Promise<{ bytes: Uint8Array; etag: string; lastModifiedAt: string; lastModifiedBy: string }> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!res.ok) throw await parseError(res);
  const buf = await res.arrayBuffer();
  return {
    bytes: new Uint8Array(buf),
    etag: res.headers.get('etag') ?? '',
    lastModifiedAt: res.headers.get('x-last-modified-at') ?? '',
    lastModifiedBy: res.headers.get('x-last-modified-by') ?? '',
  };
}

export interface PutBlobResult {
  etag: string;
  lastModifiedAt: string;
  lastModifiedBy: string;
  bytes: number;
}

export async function apiPutBlob(
  path: string,
  bytes: Uint8Array,
  ifMatch: string
): Promise<PutBlobResult> {
  // Copy into a standalone ArrayBuffer view so BodyInit/BlobPart typing
  // accepts it regardless of which ArrayBuffer variant TS infers from the
  // caller's Uint8Array (gzipSync from fflate returns ArrayBufferLike).
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'content-type': 'application/octet-stream',
      'if-match': ifMatch,
    },
    body: buf,
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as PutBlobResult;
}
