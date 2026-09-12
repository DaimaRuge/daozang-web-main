import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { reportContent } from '@/lib/db';

/**
 * 举报 UGC（旁注/评论）。登录用户可举报，累计达阈值自动隐藏待人工复核。
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'login required' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const kind = p.kind === 'annotation' || p.kind === 'comment' ? p.kind : null;
  const id = typeof p.id === 'string' ? p.id : '';

  if (!kind || !id) {
    return NextResponse.json({ error: 'kind and id required' }, { status: 400 });
  }

  const result = await reportContent(kind, id);
  if (!result.found) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, hidden: result.hidden });
}
