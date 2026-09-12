import { NextResponse, after } from 'next/server';
import { auth } from '@/auth';
import {
  createComment,
  getCommentsByBook,
  deleteComment,
  countUserContributionsToday,
} from '@/lib/db';
import { UGC_LIMITS, sanitizeUgcText } from '@/lib/ugc';
import { AuthzError, requireActiveUser } from '@/lib/auth-role';
import { evaluateHardRules } from '@/lib/moderation/rules';
import {
  applyDeferredAiReview,
  persistAiReview,
  planTextUgcVisibility,
} from '@/lib/moderation/pipeline';

/**
 * 全文评论 API。
 * - GET：任何人可读某书 approved 评论（倒序）。
 * - POST：登录用户发布篇级评论。
 * - DELETE：作者删除自己的评论。
 */

export async function GET(req: Request) {
  const bookId = new URL(req.url).searchParams.get('bookId');
  if (!bookId) {
    return NextResponse.json({ error: 'bookId required' }, { status: 400 });
  }
  const rows = await getCommentsByBook(bookId);
  const comments = rows.map(r => ({
    id: r.id,
    parentId: r.parent_id,
    body: r.body,
    authorName: r.author_name || '匿名道友',
    authorUserId: r.author_user_id,
    createdAt: r.created_at,
  }));
  return NextResponse.json({ ok: true, comments });
}

export async function POST(req: Request) {
  let userId: string;
  try {
    ({ userId } = await requireActiveUser());
  } catch (err) {
    if (err instanceof AuthzError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;

  const bookId = typeof p.bookId === 'string' ? p.bookId : '';
  const text = sanitizeUgcText(p.body, UGC_LIMITS.commentMaxLen);

  if (!bookId || !text) {
    return NextResponse.json({ error: 'bookId and body required' }, { status: 400 });
  }

  const rules = evaluateHardRules(text);
  if (rules.reject) {
    return NextResponse.json({ error: '内容未通过审核' }, { status: 400 });
  }

  if ((await countUserContributionsToday(userId)) >= UGC_LIMITS.dailyPerUser) {
    return NextResponse.json({ error: '今日发布已达上限，明日再来' }, { status: 429 });
  }

  const vis = await planTextUgcVisibility({ text });
  const session = await auth();
  const created = await createComment({
    bookId,
    body: text,
    authorUserId: userId,
    authorName: session?.user?.name ?? null,
    parentId: typeof p.parentId === 'string' ? p.parentId : null,
    status: vis.status,
  });
  if (vis.review) {
    await persistAiReview('comment', created.id, vis.policy, vis.review);
  }
  if (vis.defer) {
    after(() => applyDeferredAiReview('comment', created.id, text));
  }

  return NextResponse.json({
    ok: true,
    comment: {
      id: created.id,
      parentId: created.parent_id,
      body: created.body,
      authorName: created.author_name || '匿名道友',
      authorUserId: created.author_user_id,
      createdAt: created.created_at,
    },
  });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'login required' }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }
  const removed = await deleteComment(id, session.user.id);
  if (!removed) {
    return NextResponse.json({ error: 'not found or not owner' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
