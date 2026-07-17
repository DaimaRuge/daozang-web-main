import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { insertAnalyticsEvents } from '@/lib/db';
import type { UserEvent } from '@/lib/user-data';

const ALLOWED_EVENTS = new Set<string>([
  'page_view',
  'book_open',
  'chapter_open',
  'reading_progress',
  'reading_page_turn',
  'text_select',
  'bookmark_create',
  'note_create',
  'search',
  'ai_question',
  'ai_explanation',
  'music_play',
  'music_pause',
  'share',
  'recommendation_click',
  'illustration_generate',
  'illustration_view',
]);

/** 批量行为事件上报（PRD §5 埋点） */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const items = Array.isArray(body) ? body : (body as { events?: unknown[] })?.events;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'events array required' }, { status: 400 });
  }
  if (items.length > 50) {
    return NextResponse.json({ error: 'max 50 events per batch' }, { status: 400 });
  }

  const session = await auth();
  const userId = session?.user?.id;
  const platform = req.headers.get('user-agent')?.slice(0, 120) ?? undefined;

  const valid = items
    .filter(
      (e): e is { event: UserEvent; sessionId?: string; bookId?: string; extra?: Record<string, unknown> } =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as { event?: unknown }).event === 'string' &&
        ALLOWED_EVENTS.has((e as { event: string }).event),
    )
    .map(e => ({
      event: e.event,
      userId,
      sessionId: typeof e.sessionId === 'string' ? e.sessionId : undefined,
      bookId: typeof e.bookId === 'string' ? e.bookId : undefined,
      platform,
      extra: e.extra,
    }));

  if (valid.length === 0) {
    return NextResponse.json({ error: 'no valid events' }, { status: 400 });
  }

  const stored = insertAnalyticsEvents(valid);
  return NextResponse.json({ ok: true, stored });
}
