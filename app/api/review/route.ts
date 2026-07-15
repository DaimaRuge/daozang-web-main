import { NextRequest, NextResponse } from 'next/server';
import { saveOverride } from '@/lib/parser-overrides';
import { ContentBlockType } from '@/lib/content-schema';

/**
 * 人工审核保存 API（仅开发环境）。
 *
 * 为什么限制在开发环境：校正结果写入仓库内的 data/parser-overrides.json，
 * 属于「内容生产」环节 —— 审核者在本地完成校正后随代码提交上线，
 * 线上（Vercel 等）文件系统只读，也不应暴露写入口。
 * 如需在私有部署环境开放，设置 DZ_ENABLE_REVIEW=1。
 */

const REVIEW_ENABLED = process.env.NODE_ENV !== 'production' || process.env.DZ_ENABLE_REVIEW === '1';

/** 审核页允许改判的目标类型（与 ReviewClient 的选项一致） */
const ALLOWED_TYPES: ContentBlockType[] = [
  'heading', 'subheading', 'paragraph', 'quote', 'verse',
  'annotation', 'commentary', 'original-note', 'separator',
];

export async function POST(request: NextRequest) {
  if (!REVIEW_ENABLED) {
    return NextResponse.json({ error: '审核功能仅在开发环境可用' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const { bookId, key, type, level, remove } = (body ?? {}) as {
    bookId?: string;
    key?: string;
    type?: ContentBlockType;
    level?: number;
    remove?: boolean;
  };

  if (!bookId || !key) {
    return NextResponse.json({ error: '缺少 bookId 或 key' }, { status: 400 });
  }

  if (remove) {
    saveOverride(bookId, key, null);
    return NextResponse.json({ ok: true });
  }

  if (!type || !ALLOWED_TYPES.includes(type)) {
    return NextResponse.json({ error: `不支持的类型：${type}` }, { status: 400 });
  }

  saveOverride(bookId, key, {
    type,
    level: typeof level === 'number' ? level : undefined,
    reviewedAt: Date.now(),
  });
  return NextResponse.json({ ok: true });
}
