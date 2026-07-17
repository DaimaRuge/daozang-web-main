import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { checkAiQuota, consumeAiQuota } from '@/lib/agent/quota';
import { createDefaultContext } from '@/lib/agent/context';
import { getIllustrationStatus, startIllustrationJob } from '@/lib/illustrations-service';

/** POST 创建插图生成任务；GET ?jobId= 查询状态 */
export async function POST(req: Request) {
  let body: { bookId?: string; blockId?: string; text?: string; type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.bookId || !body.blockId || !body.text?.trim()) {
    return NextResponse.json({ error: 'bookId, blockId, text required' }, { status: 400 });
  }
  if (body.text.length > 2000) {
    return NextResponse.json({ error: 'text too long (max 2000)' }, { status: 400 });
  }

  const context = createDefaultContext({ path: `/text/${body.bookId}`, pageType: 'reader' });
  const quota = await checkAiQuota(req, context);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: '今日 AI 次数已用完', quotaRemaining: 0, limit: quota.limit },
      { status: 429 },
    );
  }

  const result = await startIllustrationJob({
    bookId: body.bookId,
    blockId: body.blockId,
    text: body.text.trim(),
    type: body.type,
  });

  if (result.status === 'pending') {
    await consumeAiQuota(req, context);
  }

  const afterQuota = await checkAiQuota(req, context);
  return NextResponse.json({ ...result, quotaRemaining: afterQuota.remaining });
}

export async function GET(req: Request) {
  const jobId = new URL(req.url).searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  }
  const status = getIllustrationStatus(jobId);
  if (!status) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 });
  }
  return NextResponse.json(status);
}
