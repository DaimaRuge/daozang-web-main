import { NextResponse } from 'next/server';
import { AuthzError, requireRole } from '@/lib/auth-role';
import {
  insertModerationRecord,
  listModerationQueue,
  setUgcStatus,
  type UgcKind,
} from '@/lib/db';

function authzJson(err: unknown) {
  if (err instanceof AuthzError) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
  throw err;
}

export async function GET(req: Request) {
  try {
    await requireRole('moderator');
  } catch (err) {
    return authzJson(err);
  }

  const url = new URL(req.url);
  const kindParam = url.searchParams.get('kind');
  const kind: UgcKind | 'all' =
    kindParam === 'annotation' || kindParam === 'comment' || kindParam === 'contribution'
      ? kindParam
      : 'all';
  const statusParam = url.searchParams.get('status');
  const status = statusParam === 'hidden' || statusParam === 'pending' || statusParam === 'approved'
    ? statusParam
    : undefined;

  const items = await listModerationQueue({ kind, status, limit: 50 });
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  let userId: string;
  try {
    ({ userId } = await requireRole('moderator'));
  } catch (err) {
    return authzJson(err);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const kind: UgcKind | null =
    p.kind === 'annotation' || p.kind === 'comment' || p.kind === 'contribution' ? p.kind : null;
  const id = typeof p.id === 'string' ? p.id : '';
  const verdict = p.verdict === 'approve' || p.verdict === 'reject' ? p.verdict : null;
  const reason = typeof p.reason === 'string' ? p.reason.slice(0, 500) : null;

  if (!kind || !id || !verdict) {
    return NextResponse.json({ error: 'kind, id, verdict required' }, { status: 400 });
  }

  const nextStatus = verdict === 'approve' ? 'approved' : 'hidden';
  const ok = await setUgcStatus(kind, id, nextStatus);
  if (!ok) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  await insertModerationRecord({
    targetType: kind,
    targetId: id,
    policy: 'human-queue',
    humanVerdict: verdict,
    moderatorUserId: userId,
    reason,
  });

  return NextResponse.json({ ok: true, status: nextStatus });
}
