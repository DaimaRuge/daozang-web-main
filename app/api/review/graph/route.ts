import { NextRequest, NextResponse } from 'next/server';
import { saveGraphEdgeOverride } from '@/lib/graph/overrides';
import type { GraphEdgeDecision } from '@/lib/graph/override-schema';
import { resetGraphRuntime } from '@/lib/graph/query';

/**
 * 图谱边审核保存 API（仅开发环境）。
 *
 * 与 /api/review 相同的理由：校正写入仓库内 JSON，属内容生产环节，
 * 线上文件系统只读，也不应暴露写入口。私有部署设 DZ_ENABLE_REVIEW=1。
 */

const REVIEW_ENABLED = process.env.NODE_ENV !== 'production' || process.env.DZ_ENABLE_REVIEW === '1';

const ALLOWED: GraphEdgeDecision[] = ['confirm', 'reject'];

export async function POST(request: NextRequest) {
  if (!REVIEW_ENABLED) {
    return NextResponse.json({ error: '审核功能仅在开发环境可用' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const { key, keys, decision, remove } = (body ?? {}) as {
    key?: string;
    keys?: string[];
    decision?: GraphEdgeDecision;
    remove?: boolean;
  };

  const batch = (keys?.length ? keys : key ? [key] : []).filter(k => k.includes('|'));
  if (batch.length === 0) {
    return NextResponse.json({ error: '缺少有效的边键' }, { status: 400 });
  }

  if (remove || decision == null) {
    for (const k of batch) saveGraphEdgeOverride(k, null);
    resetGraphRuntime();
    return NextResponse.json({ ok: true, count: batch.length });
  }

  if (!ALLOWED.includes(decision)) {
    return NextResponse.json({ error: `不支持的判定：${decision}` }, { status: 400 });
  }

  const reviewedAt = Date.now();
  for (const k of batch) saveGraphEdgeOverride(k, { decision, reviewedAt });
  resetGraphRuntime();
  return NextResponse.json({ ok: true, count: batch.length });
}
