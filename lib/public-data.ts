/**
 * 读取 public/ 下的静态数据（仅服务端）。
 *
 * 为什么不让 NFT 跟踪整个目录、而要「本地 fs / Vercel fetch」双路径：
 * `fs.readFile(public/data/content/${id}.json)` 这种动态路径会被
 * @vercel/nft 理解成「整个 content 目录都可能被读」，于是把约 100MB、
 * 1504 个 JSON 打进每一个用到数据层的 Serverless Function。
 * 再加上 audio/images，函数体积远超 Vercel 上限，预览部署失败。
 *
 * 这些文件本就是 CDN 静态资源。本地磁盘在时走 fs（测试与 next start）；
 * Vercel 上函数包里没有它们，按需 fetch 单部即可，不得把整库塞进 lambda。
 */

import fs from 'fs';
import path from 'path';

/** 分段拼接，降低 NFT 把整目录打进函数包的概率；真正的保证是 next.config 的 excludes */
function publicFile(...segments: string[]): string {
  const prefix = ['public', ...segments];
  return path.resolve(process.cwd(), prefix.join(path.sep));
}

function publicOrigin(): string | null {
  if (process.env.DZ_PUBLIC_ORIGIN) return process.env.DZ_PUBLIC_ORIGIN.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return null;
}

function bypassHeaders(): HeadersInit | undefined {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!secret) return undefined;
  // 预览部署若开了 Deployment Protection，服务端读自己的静态资源需要绕过
  return { 'x-vercel-protection-bypass': secret };
}

export function readPublicJsonSync<T>(relFromPublic: string): T | null {
  const filePath = publicFile(...relFromPublic.split('/'));
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function readPublicJson<T>(relFromPublic: string): Promise<T | null> {
  const local = readPublicJsonSync<T>(relFromPublic);
  if (local) return local;

  const origin = publicOrigin();
  if (!origin) return null;
  try {
    const res = await fetch(`${origin}/${relFromPublic}`, {
      cache: 'force-cache',
      headers: bypassHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface ContentFile {
  content?: string;
}

/** 本地同步读取一部原文。Vercel 函数包里通常没有这些文件，返回空串。 */
export function readContentSync(id: string): string {
  const data = readPublicJsonSync<ContentFile>(`data/content/${id}.json`);
  return typeof data?.content === 'string' ? data.content : '';
}

/** 一部原文：本地 fs，否则按需从 CDN 拉这一部，绝不预装整库。 */
export async function readContent(id: string): Promise<string> {
  const local = readContentSync(id);
  if (local) return local;
  const data = await readPublicJson<ContentFile>(`data/content/${id}.json`);
  return typeof data?.content === 'string' ? data.content : '';
}
