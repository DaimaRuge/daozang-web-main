import { NextResponse, after } from 'next/server';
import { auth } from '@/auth';
import {
  countUserContributionsToday,
  getRestoreCalibrationByUser,
  listRestoreCalibrations,
  updateRestoreCalibrationAi,
  upsertRestoreCalibration,
} from '@/lib/db';
import { AuthzError, requireActiveUser, requireRole } from '@/lib/auth-role';
import { UGC_LIMITS, sanitizeUgcText } from '@/lib/ugc';
import { evaluateHardRules } from '@/lib/moderation/rules';
import { getProvider } from '@/lib/agent/provider';
import {
  classifyCalibrationHeuristic,
  classifyCalibrationWithLlm,
  isCalibrationVariant,
  isCalibrationVerdict,
  isSafeImageSegment,
} from '@/lib/restore-calibration';

function authzJson(err: unknown) {
  if (err instanceof AuthzError) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
  throw err;
}

function publicRow(row: {
  id: string;
  book_id: string;
  part: string;
  file: string;
  variant: string;
  verdict: string;
  note: string;
  author_user_id: string;
  author_name: string | null;
  ai_action: string | null;
  ai_summary: string | null;
  created_at: number;
  updated_at: number;
}) {
  return {
    id: row.id,
    bookId: row.book_id,
    part: row.part,
    file: row.file,
    variant: row.variant,
    verdict: row.verdict,
    note: row.note,
    authorName: row.author_name || '匿名道友',
    authorUserId: row.author_user_id,
    aiAction: row.ai_action,
    aiSummary: row.ai_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * GET：登录用户查自己对某张图的校定；审核员可拉队列。
 * POST：提交或修订确认 / 不通过 + 备注。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const scope = url.searchParams.get('scope');

  if (scope === 'queue') {
    try {
      await requireRole('moderator');
    } catch (err) {
      return authzJson(err);
    }
    const bookId = url.searchParams.get('bookId') || undefined;
    const verdict = url.searchParams.get('verdict') || undefined;
    const items = await listRestoreCalibrations({ bookId, verdict, limit: 80 });
    return NextResponse.json({ ok: true, items: items.map(publicRow) });
  }

  let userId: string;
  try {
    ({ userId } = await requireActiveUser());
  } catch (err) {
    return authzJson(err);
  }

  const bookId = url.searchParams.get('bookId') ?? '';
  const file = url.searchParams.get('file') ?? '';
  if (!bookId || !file) {
    return NextResponse.json({ error: 'bookId and file required' }, { status: 400 });
  }
  const row = await getRestoreCalibrationByUser(userId, bookId, file);
  return NextResponse.json({ ok: true, item: row ? publicRow(row) : null });
}

export async function POST(req: Request) {
  let userId: string;
  try {
    ({ userId } = await requireActiveUser());
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

  const bookId = typeof p.bookId === 'string' ? p.bookId.trim() : '';
  const part = typeof p.part === 'string' ? p.part.trim() : '';
  const file = typeof p.file === 'string' ? p.file.trim() : '';
  const variant = isCalibrationVariant(p.variant) ? p.variant : 'cinnabar';
  const verdict = isCalibrationVerdict(p.verdict) ? p.verdict : null;
  const note = sanitizeUgcText(p.note, UGC_LIMITS.calibrationNoteMaxLen);

  if (!bookId || !part || !file || !verdict) {
    return NextResponse.json({ error: 'bookId, part, file, verdict required' }, { status: 400 });
  }
  if (!isSafeImageSegment(part) || !isSafeImageSegment(file)) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 });
  }
  if (note) {
    const rules = evaluateHardRules(note);
    if (rules.reject) {
      return NextResponse.json({ error: '内容未通过审核' }, { status: 400 });
    }
  }

  const existing = await getRestoreCalibrationByUser(userId, bookId, file);
  if (!existing && (await countUserContributionsToday(userId)) >= UGC_LIMITS.dailyPerUser) {
    return NextResponse.json({ error: '今日发布已达上限，明日再来' }, { status: 429 });
  }

  const heuristic = classifyCalibrationHeuristic(verdict, note);
  const session = await auth();
  const saved = await upsertRestoreCalibration({
    bookId,
    part,
    file,
    variant,
    verdict,
    note,
    authorUserId: userId,
    authorName: session?.user?.name ?? null,
    aiAction: heuristic.action,
    aiSummary: heuristic.summary,
  });

  const provider = getProvider('fast');
  if (provider.isConfigured()) {
    after(async () => {
      try {
        const llm = await classifyCalibrationWithLlm(verdict, note, messages =>
          provider.chat(messages),
        );
        if (llm) {
          await updateRestoreCalibrationAi(saved.id, llm.action, llm.summary);
        }
      } catch (err) {
        console.error('[restore-calibration-llm]', err instanceof Error ? err.message : err);
      }
    });
  }

  return NextResponse.json({ ok: true, item: publicRow(saved) });
}
