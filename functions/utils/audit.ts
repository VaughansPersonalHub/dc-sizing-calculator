import type { Env } from './env';

export type AuditAction =
  | 'engagement.create'
  | 'engagement.update'
  | 'engagement.delete'
  | 'engagement.archive'
  | 'blob.put'
  | 'blob.get'
  | 'blob.restore';

export async function writeAudit(
  env: Env,
  engagementId: string,
  userEmail: string,
  action: AuditAction,
  details: Record<string, unknown> = {}
): Promise<void> {
  // Fire-and-forget at the handler level via ctx.waitUntil — callers pass
  // the returned promise in. We don't throw on audit failure since a lost
  // log entry must never block the user's save.
  try {
    await env.DB
      .prepare(
        'INSERT INTO audit_log (engagement_id, user_email, action, timestamp, details) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(engagementId, userEmail, action, new Date().toISOString(), JSON.stringify(details))
      .run();
  } catch (err) {
    console.error('audit write failed', { engagementId, action, err });
  }
}
