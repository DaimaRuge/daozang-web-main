/**
 * 原书插图静态文件：按文件名精确取图。
 * jpg/jpeg/webp → 原扫描；png / .ink.png / .cinnabar.png → restored 目录对应文件。
 * 有复原时也绝不能用复原顶替原扫描请求。
 */
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { classifyRequestedFile, resolveDaozangImageFile } from '@/lib/daozang-images';
import { daozangPublicUrl } from '@/lib/daozang-image-url';

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function contentType(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function sniffContentType(file: string, buf: Buffer): string {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  return contentType(file);
}

export async function GET(_req: Request, { params }: RouteParams) {
  const segments = (await params).path ?? [];
  if (segments.length !== 2) {
    return NextResponse.json({ error: 'part/file required' }, { status: 400 });
  }
  const [part, file] = segments;
  if (!part || !file || part.includes('..') || file.includes('..') || part.includes('/') || file.includes('/')) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 });
  }
  if (!ALLOWED_EXT.has(path.extname(file).toLowerCase())) {
    return NextResponse.json({ error: 'unsupported type' }, { status: 400 });
  }

  const kind = classifyRequestedFile(file);
  if (!kind) {
    return NextResponse.json({ error: 'unsupported type' }, { status: 400 });
  }

  const hit = resolveDaozangImageFile(part, file);
  if (!hit) {
    const mediaBase = process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? '';
    if (mediaBase) {
      return NextResponse.redirect(daozangPublicUrl(part, file, mediaBase), 302);
    }
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const resolved = path.resolve(hit.absPath);
  const allowedRoot = path.resolve(path.join(process.cwd(), 'data', 'images-daozang'));
  if (!resolved.startsWith(allowedRoot + path.sep) && resolved !== allowedRoot) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 });
  }
  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const buf = fs.readFileSync(resolved);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': sniffContentType(resolved, buf),
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'X-Daozang-Image': hit.kind,
    },
  });
}
