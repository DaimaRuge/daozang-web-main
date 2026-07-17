/**
 * 在线插图生成服务（服务端）。
 *
 * LLM 生成英文 prompt → libtv 文生图 → 落盘 public/images/gen/
 * libtv 不可用时标记 failed（本地开发需绑定画布）。
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getProvider } from '@/lib/agent/provider';
import { getEntryById } from '@/lib/data';
import {
  createIllustrationJob,
  findIllustrationByBlock,
  getIllustrationJob,
  updateIllustrationJob,
} from '@/lib/db';

const OUT_DIR = path.join(process.cwd(), 'public', 'images', 'gen');

const ILLUSTRATION_SYSTEM = [
  '你是道藏典籍配图助手。根据用户给出的文言原文，生成一段英文文生图提示词（80-120词）。',
  '要求：中国传统水墨淡彩风格（ink wash painting），宣纸质感，意境悠远；',
  '根据内容选择符箓示意图、神像法相、科仪场景或山水意境；',
  '俯视图或侧视构图，非写实照片；不要现代元素、不要文字水印、no text in image。',
  '只输出英文提示词，不要其他解释。',
].join('\n');

export async function buildIllustrationPrompt(sourceText: string, bookTitle: string): Promise<string> {
  const provider = getProvider('fast');
  if (!provider.isConfigured()) {
    return `Traditional Chinese ink wash painting illustrating Taoist scripture from "${bookTitle}": ${sourceText.slice(0, 80)}, serene atmosphere, rice paper texture, no text, no modern elements`;
  }
  const reply = await provider.chat(
    [
      { role: 'system', content: ILLUSTRATION_SYSTEM },
      { role: 'user', content: `典籍：《${bookTitle}》\n\n原文：\n${sourceText.slice(0, 500)}` },
    ],
    { temperature: 0.4, maxTokens: 300 },
  );
  return reply.trim();
}

function libtvGenerate(nodeName: string, prompt: string): string {
  const safeName = nodeName.replace(/[^\w\u4e00-\u9fff-]/g, '-').slice(0, 40);
  const args = [
    'node', '--x', '0', '--y', '0', 'create', safeName,
    '-t', 'image',
    '-s', 'model=Seedream 5.0 Pro',
    '-s', 'ratio=4:3',
    '-s', 'quality=2K',
    '--prompt', prompt,
    '--run',
  ];
  const create = spawnSync('libtv', args, {
    encoding: 'utf-8',
    maxBuffer: 20 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (create.status !== 0) {
    throw new Error(create.stderr?.slice(0, 200) || 'libtv create failed');
  }

  const query = spawnSync('libtv', ['node', safeName], {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const out = query.stdout || query.stderr || '';
  const match = out.match(/https:\/\/[^\s"]+\.(png|jpe?g|webp)/i);
  if (!match) throw new Error('libtv: no image URL in output');
  return match[0];
}

async function downloadImage(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

export interface IllustrationRequest {
  bookId: string;
  blockId: string;
  text: string;
  type?: string;
}

/** 创建或复用插图任务，异步执行生成 */
export async function startIllustrationJob(req: IllustrationRequest): Promise<{
  jobId: string;
  status: string;
  imageUrl?: string;
}> {
  const type = req.type ?? 'scene';
  const existing = findIllustrationByBlock(req.bookId, req.blockId, type);
  if (existing?.status === 'done' && existing.image_url) {
    return { jobId: existing.id, status: 'done', imageUrl: existing.image_url };
  }
  if (existing && (existing.status === 'pending' || existing.status === 'processing')) {
    return { jobId: existing.id, status: existing.status };
  }

  const jobId = `illus_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  createIllustrationJob(jobId, req.bookId, req.blockId, req.text, type);

  // 异步生成，不阻塞 HTTP 响应
  void runIllustrationJob(jobId, req).catch(err => {
    console.error('[illustration]', jobId, err);
    updateIllustrationJob(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : '生成失败',
    });
  });

  return { jobId, status: 'pending' };
}

async function runIllustrationJob(jobId: string, req: IllustrationRequest): Promise<void> {
  updateIllustrationJob(jobId, { status: 'processing' });

  const entry = getEntryById(req.bookId);
  const bookTitle = entry?.title ?? '道藏典籍';

  const prompt = await buildIllustrationPrompt(req.text, bookTitle);
  updateIllustrationJob(jobId, { prompt });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const nodeName = `gen-${req.bookId.slice(0, 8)}-${req.blockId.slice(0, 8)}`;
  const remoteUrl = libtvGenerate(nodeName, prompt);

  const ext = path.extname(new URL(remoteUrl).pathname) || '.jpg';
  const fileName = `${req.bookId}-${req.blockId.replace(/:/g, '-')}${ext}`;
  const localPath = path.join(OUT_DIR, fileName);
  await downloadImage(remoteUrl, localPath);

  updateIllustrationJob(jobId, {
    status: 'done',
    image_url: `/images/gen/${fileName}`,
  });
}

export function getIllustrationStatus(jobId: string) {
  const job = getIllustrationJob(jobId);
  if (!job) return null;
  return {
    jobId: job.id,
    status: job.status,
    imageUrl: job.image_url ?? undefined,
    error: job.error ?? undefined,
    bookId: job.book_id,
    blockId: job.block_id,
  };
}
