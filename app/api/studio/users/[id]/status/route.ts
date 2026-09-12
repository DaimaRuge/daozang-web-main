import { NextResponse } from 'next/server';
import { AuthzError, requireRole } from '@/lib/auth-role';
import { updateUserStatus } from '@/lib/db';

const ALLOWED = new Set(['active', 'muted', 'banned']);

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let actorId: string;
  try {
    ({ userId: actorId } = await requireRole('moderator'));
  } catch (err) {
    if (err instanceof AuthzError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    throw err;
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }
  if (id === actorId) {
    return NextResponse.json({ error: '不能修改自己的账号状态' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const status = typeof (body as { status?: unknown })?.status === 'string'
    ? (body as { status: string }).status
    : '';
  if (!ALLOWED.has(status)) {
    return NextResponse.json({ error: 'status 须为 active / muted / banned' }, { status: 400 });
  }

  const ok = await updateUserStatus(id, status);
  if (!ok) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, status });
}
