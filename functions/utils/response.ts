// Uniform JSON responses across every handler. Keeping the helper tiny on
// purpose — anything richer (pagination envelope, problem+json) can wait
// until we actually need it.

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...init.headers,
    },
  });
}

export function error(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, { status });
}

export function notFound(resource: string): Response {
  return error(404, 'not_found', `${resource} not found`);
}

export function badRequest(message: string): Response {
  return error(400, 'bad_request', message);
}

export function conflict(message: string, extra: Record<string, unknown> = {}): Response {
  return json(
    { error: { code: 'conflict', message }, ...extra },
    { status: 409 }
  );
}
