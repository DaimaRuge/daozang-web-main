/**
 * 从本机高清朱砂 PNG 做出网页压缩 WebP，并把原扫描 + 压缩图传到 Vercel Blob。
 * 高清 ink/cinnabar/png 母版不上传，留给日后付费下载。
 *
 *   npx tsx scripts/publish-daozang-web-images.ts --limit=40
 *   npx tsx scripts/publish-daozang-web-images.ts
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { put } from '@vercel/blob';
import { daozangObjectKey } from '../lib/daozang-image-url';
import { imagesDataRoot } from '../lib/daozang-images';
import {
  WEB_CINNABAR_ALPHA_QUALITY,
  WEB_CINNABAR_EFFORT,
  WEB_CINNABAR_LONG_EDGE,
  WEB_CINNABAR_QUALITY,
  webCinnabarFile,
  type DaozangWebImageManifest,
} from '../lib/daozang-web-images';

const skipBuild = process.argv.includes('--skip-build');
const skipUpload = process.argv.includes('--skip-upload');
const scansOnly = process.argv.includes('--scans-only');
const webOnly = process.argv.includes('--web-only');
const limit = Math.max(0, parseInt(flagValue('--limit') ?? '0', 10) || 0);
const concurrency = Math.max(1, parseInt(flagValue('--concurrency') ?? '8', 10) || 8);
const maxWebMb = Math.max(0, parseInt(flagValue('--max-web-mb') ?? '600', 10) || 600);

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

function webRoot(): string {
  return path.join(imagesDataRoot(), 'web');
}

function walkScanJobs(): { part: string; file: string; src: string }[] {
  const root = path.join(imagesDataRoot(), 'data', 'images');
  const jobs: { part: string; file: string; src: string }[] = [];
  if (!fs.existsSync(root)) return jobs;
  for (const part of fs.readdirSync(root, { withFileTypes: true })) {
    if (!part.isDirectory()) continue;
    for (const name of fs.readdirSync(path.join(root, part.name))) {
      const src = path.join(root, part.name, name);
      if (!fs.statSync(src).isFile()) continue;
      if (!/\.(jpe?g|png|webp)$/i.test(name)) continue;
      jobs.push({ part: part.name, file: name, src });
      if (limit && jobs.length >= limit) return jobs;
    }
  }
  return jobs;
}

function walkCinnabarJobs(): { part: string; file: string; src: string; dest: string }[] {
  const root = path.join(imagesDataRoot(), 'restored');
  const jobs: { part: string; file: string; src: string; dest: string }[] = [];
  if (!fs.existsSync(root)) return jobs;
  for (const part of fs.readdirSync(root, { withFileTypes: true })) {
    if (!part.isDirectory()) continue;
    for (const name of fs.readdirSync(path.join(root, part.name))) {
      if (!name.toLowerCase().endsWith('.cinnabar.png')) continue;
      const file = name.replace(/\.cinnabar\.png$/i, '.jpg');
      const src = path.join(root, part.name, name);
      const dest = path.join(webRoot(), part.name, webCinnabarFile(file));
      jobs.push({ part: part.name, file, src, dest });
      if (limit && jobs.length >= limit) return jobs;
    }
  }
  return jobs;
}

async function mapPool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, Math.max(1, items.length)) }, () => worker()));
}

async function buildWebp(jobs: { dest: string; src: string }[]): Promise<number> {
  let done = 0;
  await mapPool(jobs, concurrency, async job => {
    fs.mkdirSync(path.dirname(job.dest), { recursive: true });
    await sharp(job.src, { failOn: 'none' })
      .resize({
        width: WEB_CINNABAR_LONG_EDGE,
        height: WEB_CINNABAR_LONG_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
        kernel: 'lanczos3',
      })
      .webp({
        quality: WEB_CINNABAR_QUALITY,
        alphaQuality: WEB_CINNABAR_ALPHA_QUALITY,
        effort: WEB_CINNABAR_EFFORT,
        smartSubsample: true,
      })
      .toFile(job.dest);
    done += 1;
    if (done % 400 === 0) console.log(`压缩 ${done}/${jobs.length}`);
  });
  return done;
}

async function uploadFile(key: string, src: string, contentType: string): Promise<void> {
  const body = fs.readFileSync(src);
  await put(key, body, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

async function main() {
  loadEnvLocal();
  const cinnabarJobs = walkCinnabarJobs();
  const scanJobs = walkScanJobs();
  console.log(`扫描 ${scanJobs.length} 朱砂母版 ${cinnabarJobs.length} skipBuild=${skipBuild} skipUpload=${skipUpload} scansOnly=${scansOnly} webOnly=${webOnly}`);

  if (!skipBuild && !scansOnly && cinnabarJobs.length) {
    const n = await buildWebp(cinnabarJobs);
    console.log(`压缩完成 ${n}`);
  }

  if (skipUpload) {
    writeManifest(cinnabarJobs.map(({ part, file }) => ({ part, file })));
    return;
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('缺少 BLOB_READ_WRITE_TOKEN，无法上传');
  }

  let uploaded = 0;
  if (!webOnly) {
    await mapPool(scanJobs, concurrency, async job => {
      const ext = path.extname(job.file).toLowerCase();
      const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      await uploadFile(daozangObjectKey(job.part, job.file), job.src, type);
      uploaded += 1;
      if (uploaded % 400 === 0) console.log(`上传原扫描 ${uploaded}/${scanJobs.length}`);
    });
    console.log(`原扫描已传 ${uploaded}`);
  }

  if (scansOnly) {
    writeManifest([]);
    return;
  }

  let webUp = 0;
  let webBytes = 0;
  const uploadedWeb: { part: string; file: string }[] = [];
  const budget = maxWebMb * 1024 * 1024;
  for (const job of cinnabarJobs) {
    if (!fs.existsSync(job.dest)) continue;
    const size = fs.statSync(job.dest).size;
    if (webBytes + size > budget) {
      console.log(`压缩图达到 ${maxWebMb}MB 上限，已传 ${webUp}，其余留本机`);
      break;
    }
    await uploadFile(daozangObjectKey(job.part, webCinnabarFile(job.file)), job.dest, 'image/webp');
    webUp += 1;
    webBytes += size;
    uploadedWeb.push({ part: job.part, file: job.file });
    if (webUp % 400 === 0) console.log(`上传压缩图 ${webUp} ${(webBytes / 1024 / 1024).toFixed(1)}MB`);
  }
  writeManifest(uploadedWeb);
  console.log(`压缩图已传 ${webUp} ${(webBytes / 1024 / 1024).toFixed(1)}MB`);
}

function writeManifest(items: { part: string; file: string }[]): void {
  const manifest: DaozangWebImageManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    longEdge: WEB_CINNABAR_LONG_EDGE,
    stats: { webCinnabar: items.length },
    items: items.map(({ part, file }) => ({ part, file })),
  };
  const manifestPath = path.join(process.cwd(), 'data', 'daozang-web-images.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  console.log(`清单 ${manifestPath} ${manifest.stats.webCinnabar}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
