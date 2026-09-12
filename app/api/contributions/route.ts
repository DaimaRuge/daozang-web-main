import { NextResponse } from 'next/server';
import { AuthzError, requireActiveUser } from '@/lib/auth-role';
import {
  countUserContributionsToday,
  createContribution,
  listApprovedContributions,
  type ClaimedLicense,
  type ContributionKind,
} from '@/lib/db';
import { UGC_LIMITS, sanitizeUgcText } from '@/lib/ugc';
import { evaluateHardRules } from '@/lib/moderation/rules';
import { persistAiReview, planContributionVisibility } from '@/lib/moderation/pipeline';
import { isOwnedStorageKey, isStorageConfigured, type MediaKind } from '@/lib/storage';

const LICENSES = new Set<ClaimedLicense>(['public-domain', 'own-work', 'licensed', 'unknown']);

function asKind(v: unknown): ContributionKind | null {
  return v === 'image' || v === 'audio' || v === 'book' ? v : null;
}

export async function GET() {
  const items = await listApprovedContributions(30);
  return NextResponse.json({
    ok: true,
    items: items.map(publicItem),
  });
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
  const kind = asKind(p.kind);
  const title = sanitizeUgcText(p.title, 80);
  const sourceNote = sanitizeUgcText(p.sourceNote, 500);
  const noteBody = sanitizeUgcText(p.body, 2000);
  const claimedLicense = typeof p.claimedLicense === 'string' && LICENSES.has(p.claimedLicense as ClaimedLicense)
    ? (p.claimedLicense as ClaimedLicense)
    : null;
  const storageKey = typeof p.storageKey === 'string' ? p.storageKey : '';
  const contentType = typeof p.contentType === 'string' ? p.contentType : '';

  if (!kind || !title || !sourceNote || !claimedLicense) {
    return NextResponse.json({ error: 'kind, title, sourceNote, claimedLicense required' }, { status: 400 });
  }

  const rules = evaluateHardRules(`${title}\n${sourceNote}\n${noteBody}`);
  if (rules.reject) {
    return NextResponse.json({ error: '内容未通过审核' }, { status: 400 });
  }

  if (kind === 'image' || kind === 'audio') {
    if (!isStorageConfigured()) {
      return NextResponse.json({ error: '对象存储未配置' }, { status: 503 });
    }
    if (!isOwnedStorageKey(kind as MediaKind, storageKey)) {
      return NextResponse.json({ error: '无效的文件 key' }, { status: 400 });
    }
  }

  if ((await countUserContributionsToday(userId)) >= UGC_LIMITS.dailyPerUser) {
    return NextResponse.json({ error: '今日发布已达上限，明日再来' }, { status: 429 });
  }

  const contentKind = kind === 'book' ? 'book' : 'media';
  const vis = await planContributionVisibility({
    contentKind,
    text: `标题：${title}\n来源：${sourceNote}\n说明：${noteBody}`,
  });

  const created = await createContribution({
    userId,
    kind,
    title,
    body: noteBody || null,
    sourceNote,
    claimedLicense,
    storageKey: kind === 'book' ? null : storageKey,
    contentType: kind === 'book' ? null : contentType,
    status: vis.status,
  });
  if (vis.review) {
    await persistAiReview('contribution', created.id, vis.policy, vis.review);
  }

  return NextResponse.json({
    ok: true,
    contribution: publicItem(created),
  });
}

function publicItem(row: {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  source_note: string;
  claimed_license: string;
  storage_key: string | null;
  content_type: string | null;
  status: string;
  created_at: number;
  author_name?: string | null;
}) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    sourceNote: row.source_note,
    claimedLicense: row.claimed_license,
    storageKey: row.storage_key,
    contentType: row.content_type,
    status: row.status,
    createdAt: row.created_at,
    authorName: row.author_name || '匿名道友',
  };
}
