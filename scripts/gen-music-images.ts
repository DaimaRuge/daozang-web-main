/**
 * 道乐模块专属配图批量生成（libtv CLI）。
 *
 * 每首曲目一张独立水墨图，不复用五行图。输出 public/images/music/{theme}-{id}.jpg
 *
 * 前置：在项目根目录 libtv project use 已绑定画布
 * 运行：npx tsx scripts/gen-music-images.ts [--force] [--max=N]
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { buildMusicImageJobs, MUSIC_IMAGE_JOB_COUNT } from '../lib/music-image-prompts';

const OUT_DIR = path.resolve(__dirname, '../public/images/music');
const force = process.argv.includes('--force');
const maxArg = process.argv.find(a => a.startsWith('--max='));
const max = maxArg ? parseInt(maxArg.split('=')[1], 10) : Infinity;

function extractImageUrl(stdout: string): string | null {
  const m = stdout.match(/https:\/\/[^\s"\\]+\.(?:png|jpe?g|webp)/i);
  return m?.[0] ?? null;
}

function runLibtv(args: string[]): string {
  const result = spawnSync('libtv', args, {
    encoding: 'utf-8',
    maxBuffer: 30 * 1024 * 1024,
    shell: false,
  });
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) {
    throw new Error(out.trim() || `libtv exit ${result.status}`);
  }
  return out;
}

function libtvGenerate(nodeName: string, prompt: string, x: number): string {
  try {
    const stdout = runLibtv([
      'node',
      '--x', String(x),
      '--y', '0',
      'create', nodeName,
      '-t', 'image',
      '-s', 'model=Seedream 5.0 Pro',
      '-s', 'ratio=1:1',
      '-s', 'quality=2K',
      '--prompt', prompt,
      '--run',
    ]);
    const url = extractImageUrl(stdout);
    if (url) return url;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 断点续跑：节点已存在则更新 prompt 并重新生成
    if (!/exist|已存在|already/i.test(msg)) throw e;
    console.log(`[retry-run] ${nodeName} (node exists)`);
  }

  runLibtv(['node', nodeName, '--prompt', prompt, '--run']);
  const nodeOut = runLibtv(['node', nodeName]);
  const url2 = extractImageUrl(nodeOut);
  if (!url2) throw new Error(`no image URL for ${nodeName}`);
  return url2;
}

async function download(url: string, destPng: string): Promise<void> {
  const result = spawnSync('curl', ['-fsSL', '-o', destPng, url], {
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) throw new Error(`curl failed for ${url}`);
}

async function compressToJpg(srcPng: string, destJpg: string): Promise<void> {
  await sharp(srcPng)
    .resize({ width: 1024, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toFile(destJpg);
  fs.unlinkSync(srcPng);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jobs = buildMusicImageJobs();
  console.log(`[music-images] ${jobs.length} jobs (catalog expects ${MUSIC_IMAGE_JOB_COUNT})`);

  let x = 2880; // 避开画布上已有 img-* 节点（最大 x≈2400）
  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of jobs) {
    if (done + skipped + failed >= max) break;
    const destJpg = path.join(OUT_DIR, job.filename);
    if (!force && fs.existsSync(destJpg)) {
      console.log(`[skip] ${job.filename}`);
      skipped++;
      x += 480;
      continue;
    }

    console.log(`[gen] ${job.filename} — ${job.track.title}`);
    try {
      const url = libtvGenerate(job.nodeName, job.prompt, x);
      const tmpPng = path.join(OUT_DIR, job.filename.replace('.jpg', '.png'));
      await download(url, tmpPng);
      await compressToJpg(tmpPng, destJpg);
      console.log(`[done] ${destJpg}`);
      done++;
      x += 480;
      // libtv 限流：曲目间留间隔
      await new Promise(r => setTimeout(r, 8000));
    } catch (e) {
      console.error(`[fail] ${job.filename}`, e instanceof Error ? e.message : e);
      failed++;
      await new Promise(r => setTimeout(r, 15000));
    }
  }

  console.log(`[summary] done=${done} skipped=${skipped} failed=${failed}`);
  const total = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.jpg')).length;
  if (total >= MUSIC_IMAGE_JOB_COUNT && failed === 0) {
    console.log('[all-done]');
  } else if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
