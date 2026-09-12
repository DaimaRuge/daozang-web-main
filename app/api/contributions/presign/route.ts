import { NextResponse } from 'next/server';
import { AuthzError, requireActiveUser } from '@/lib/auth-role';
import {
  buildStorageKey,
  createUploadUrl,
  isStorageConfigured,
  UPLOAD_CACHE_CONTROL,
  type MediaKind,
} from '@/lib/storage';

const ALLOWED: Record<string, { kind: MediaKind; maxBytes: number }> = {
  'image/jpeg': { kind: 'image', maxBytes: 12 * 1024 * 1024 },
  'image/png': { kind: 'image', maxBytes: 12 * 1024 * 1024 },
  'image/webp': { kind: 'image', maxBytes: 12 * 1024 * 1024 },
  'image/gif': { kind: 'image', maxBytes: 8 * 1024 * 1024 },
  'audio/mpeg': { kind: 'audio', maxBytes: 40 * 1024 * 1024 },
  'audio/mp3': { kind: 'audio', maxBytes: 40 * 1024 * 1024 },
  'audio/wav': { kind: 'audio', maxBytes: 40 * 1024 * 1024 },
  'audio/ogg': { kind: 'audio', maxBytes: 40 * 1024 * 1024 },
  'audio/mp4': { kind: 'audio', maxBytes: 40 * 1024 * 1024 },
};

/**
 * 签发预签名 PUT。浏览器直传对象存储，避免文件经过 Serverless。
 */
export async function POST(req: Request) {
  try {
    await requireActiveUser();
  } catch (err) {
    if (err instanceof AuthzError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    throw err;
  }

  if (!isStorageConfigured()) {
    return NextResponse.json({ error: '对象存储未配置' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const filename = typeof p.filename === 'string' ? p.filename : '';
  const contentType = typeof p.contentType === 'string' ? p.contentType.toLowerCase() : '';
  const allowed = ALLOWED[contentType];
  if (!filename || !allowed) {
    return NextResponse.json({ error: '仅支持 jpeg/png/webp/gif 图片或 mp3/wav/ogg 音频' }, { status: 400 });
  }

  const key = buildStorageKey(allowed.kind, filename);
  const uploadUrl = await createUploadUrl(key, contentType);
  return NextResponse.json({
    ok: true,
    key,
    uploadUrl,
    maxBytes: allowed.maxBytes,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': UPLOAD_CACHE_CONTROL,
    },
  });
}
