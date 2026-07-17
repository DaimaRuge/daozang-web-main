import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getReadingProgress, upsertReadingProgress } from '@/lib/db';

/** 阅读进度上报（PRD §5）；登录用户落库，匿名仅 ack */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const p = body as Record<string, unknown>;
  if (typeof p.bookId !== 'string') {
    return NextResponse.json({ error: 'bookId required' }, { status: 400 });
  }

  const session = await auth();
  let stored: 'local-only' | 'database' = 'local-only';

  if (session?.user?.id) {
    upsertReadingProgress(session.user.id, p.bookId, p);
    stored = 'database';
  }

  if (process.env.NODE_ENV === 'development') {
    console.debug('[api/progress]', stored, p.bookId);
  }

  return NextResponse.json({
    ok: true,
    stored,
    receivedAt: Date.now(),
  });
}

/** 拉取登录用户的云端进度（供多端同步） */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'login required' }, { status: 401 });
  }

  const bookId = new URL(req.url).searchParams.get('bookId') ?? undefined;
  const items = getReadingProgress(session.user.id, bookId);
  return NextResponse.json({ ok: true, progress: items });
}
