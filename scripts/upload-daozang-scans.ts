/**
 * 把原书扫描上传到对象存储，key 固定为 daozang-images/<部>/<文件>。
 * 不上传 restored/（约 20GB）；已存在的对象默认跳过，--force 才覆盖。
 *
 * 运行：npx tsx scripts/upload-daozang-scans.ts
 *       npx tsx scripts/upload-daozang-scans.ts --dry-run --limit=20
 */
import fs from 'fs';
import path from 'path';
import { daozangObjectKey } from '../lib/daozang-image-url';
import { imagesDataRoot } from '../lib/daozang-images';
import { isStorageConfigured, objectExists, uploadObject } from '../lib/storage';

const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');
const limit = Math.max(0, parseInt(flagValue('--limit') ?? '0', 10) || 0);
const concurrency = Math.max(1, parseInt(flagValue('--concurrency') ?? '8', 10) || 8);

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function flagValue(name: string): string | undefined {
  const eq = process.argv.find(a => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

interface Job {
  part: string;
  file: string;
  src: string;
}

function collectJobs(): Job[] {
  const root = path.join(imagesDataRoot(), 'data', 'images');
  if (!fs.existsSync(root)) throw new Error(`缺少原扫描目录 ${root}`);
  const jobs: Job[] = [];
  for (const part of fs.readdirSync(root, { withFileTypes: true })) {
    if (!part.isDirectory()) continue;
    const dir = path.join(root, part.name);
    for (const name of fs.readdirSync(dir)) {
      const src = path.join(dir, name);
      if (!fs.statSync(src).isFile()) continue;
      if (!MIME[path.extname(name).toLowerCase()]) continue;
      jobs.push({ part: part.name, file: name, src });
      if (limit && jobs.length >= limit) return jobs;
    }
  }
  return jobs;
}

async function mapPool<T>(items: T[], n: number, fn: (item: T, i: number) => Promise<void>): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, () => worker()));
}

async function main() {
  loadEnvLocal();
  if (!dryRun && !isStorageConfigured()) {
    throw new Error('对象存储未配置：需要 DZ_S3_* 与 NEXT_PUBLIC_MEDIA_BASE_URL');
  }
  const jobs = collectJobs();
  let uploaded = 0;
  let skipped = 0;
  let bytes = 0;
  console.log(`待处理 ${jobs.length} 张原扫描 dryRun=${dryRun} force=${force} concurrency=${concurrency}`);
  if (dryRun) return;

  await mapPool(jobs, concurrency, async job => {
    const key = daozangObjectKey(job.part, job.file);
    if (!force && (await objectExists(key))) {
      skipped += 1;
      return;
    }
    const body = fs.readFileSync(job.src);
    const ext = path.extname(job.file).toLowerCase();
    await uploadObject(key, body, MIME[ext]);
    uploaded += 1;
    bytes += body.byteLength;
    if ((uploaded + skipped) % 500 === 0) {
      console.log(`进度 uploaded=${uploaded} skipped=${skipped}`);
    }
  });
  console.log(`完成 uploaded=${uploaded} skipped=${skipped} ${(bytes / 1024 / 1024).toFixed(1)} MB`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
