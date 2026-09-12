/**
 * 原书插图一比一高清复原。
 *
 * 默认走项目已有的 libtv 图生图（原扫描作为参考图）；
 * `--engine gpt-image` 则调用 Images-Daozang-Data 自带的 Python 脚本。
 *
 * 运行：
 *   npx tsx scripts/restore-daozang-images.ts --bookId <本站id> --limit=2 --local
 *   npx tsx scripts/restore-daozang-images.ts --all --local --limit=400 --concurrency=8
 *   npx tsx scripts/restore-daozang-images.ts --all --local --concurrency=8 --quiet
 *
 * 目录里的 w/h 是网页排版尺寸，不可信；是否细条以原文件实际像素为准。
 * 全量默认本地 Lanczos + 抠透明 + 朱砂，不调 libtv。
 * 产出：data/images-daozang/restored/<部>/<同名>.ink.png 与 .cinnabar.png；
 * 阅读页默认展示复原图，悬停对照原扫描。
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getIndex } from '../lib/data';
import {
  hasRestoredImage,
  loadDaozangImageCatalog,
  originalImagePath,
  restoredImagePath,
  restoredJpegPath,
  type DaozangBookImages,
  type DaozangImageHit,
} from '../lib/daozang-images';
import { isNoopRestore, writeRestoreVariants } from '../lib/daozang-restore-image';

const dryRun = process.argv.includes('--dry-run');
const allBooks = process.argv.includes('--all');
const force = process.argv.includes('--force');
const quiet = process.argv.includes('--quiet');
const engineArg = process.argv.find(a => a.startsWith('--engine='));
const engine = (engineArg?.split('=')[1] ?? 'libtv') as 'libtv' | 'gpt-image';
let localOnly = process.argv.includes('--local') || allBooks;
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const parsedLimit = limitArg ? parseInt(limitArg.split('=')[1], 10) : NaN;
const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : allBooks ? Infinity : 2;
const concurrency = Math.max(1, parseInt(flagValue('--concurrency') ?? (allBooks ? '8' : '1'), 10) || 1);
const minEdge = Math.max(1, parseInt(flagValue('--min-edge') ?? '24', 10) || 24);
const bookIdArg = flagValue('--bookId');
const titleArg = flagValue('--title');

function flagValue(name: string): string | undefined {
  const eq = process.argv.find(a => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const idx = process.argv.indexOf(name);
  if (idx >= 0) return process.argv[idx + 1];
  return undefined;
}

const RESTORE_PROMPT = `你是道藏典籍图像修复专家。请修复并放大参考图中的道教典籍插图，输出【黑白线稿风格】的高清版本。
【出处】《{title}》（{part} / {file}）
修复要求：
1. 保持原图的构图、线条、文字、符号完全一致；只做清晰化与放大，不得增、删、改任何笔画或文字。
2. 输出为单色（黑/白）线稿，无光影、无彩色、无背景装饰。
3. 分辨率放大到长边 >= 1024px，线条保持锐利；原图若为符箓长条，保持原纵横比。
4. 不要添加水印、边框、页码、题签。`;

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

function ratioFor(hit: DaozangImageHit): string {
  if (hit.w && hit.h) {
    if (hit.h > hit.w * 1.4) return '9:16';
    if (hit.w > hit.h * 1.4) return '16:9';
  }
  return '1:1';
}

function safeNodeName(prefix: string, file: string, idx: number): string {
  const stem = file.replace(/\.[^.]+$/, '').replace(/[^\w\u4e00-\u9fff-]/g, '-').slice(0, 28);
  return `${prefix}-${idx}-${stem}`.slice(0, 40);
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`download ${res.status}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function restoreWithLibtv(book: DaozangBookImages, hit: DaozangImageHit, idx: number): string {
  const src = originalImagePath(hit.p, hit.f);
  if (!fs.existsSync(src)) throw new Error(`missing original ${src}`);
  const refName = safeNodeName('ref', hit.f, idx);
  const nodeName = safeNodeName('rs', hit.f, idx);
  const prompt = RESTORE_PROMPT
    .replace('{title}', book.title)
    .replace('{part}', hit.p)
    .replace('{file}', hit.f);

  runLibtv(['upload', refName, '-t', 'image', '--resource', src, '--x', String(idx * 80), '--y', '0']);
  const out = runLibtv([
    'node', '--x', String(420 + idx * 80), '--y', '0', 'create', nodeName,
    '-t', 'image',
    '-s', 'model=Seedream 5.0 Pro',
    '-s', 'modeType=image2image',
    '-s', `ratio=${ratioFor(hit)}`,
    '-s', 'quality=2K',
    '--prompt', prompt,
    '--left', refName,
    '--run',
  ]);
  const url = extractImageUrl(out);
  if (url) return url;
  const queried = runLibtv(['node', nodeName]);
  const url2 = extractImageUrl(queried);
  if (!url2) throw new Error(`no image URL for ${nodeName}`);
  return url2;
}

function restoreWithGptImage(hits: DaozangImageHit[]): void {
  const py = path.join(process.cwd(), 'data', 'images-daozang', 'scripts', 'restore_gpt_image.py');
  const part = hits[0]?.p;
  const args = [py, '--out', path.join(process.cwd(), 'data', 'images-daozang', 'restored'), '--limit', String(hits.length)];
  if (part) args.push('--part', part);
  const result = spawnSync('python', args, { stdio: 'inherit', shell: false, env: process.env });
  if (result.status !== 0) throw new Error('gpt-image restore failed');
}

function pickBook(catalog: NonNullable<ReturnType<typeof loadDaozangImageCatalog>>): DaozangBookImages {
  if (bookIdArg) {
    const book = catalog.books[bookIdArg];
    if (!book) throw new Error(`catalog 中没有 bookId ${bookIdArg}`);
    return book;
  }
  if (titleArg) {
    const book = Object.values(catalog.books).find(b => b.title.includes(titleArg) || titleArg.includes(b.title));
    if (!book) throw new Error(`catalog 中没有书名包含 ${titleArg}`);
    return book;
  }
  const ranked = Object.values(catalog.books).sort((a, b) => a.images.length - b.images.length);
  const small = ranked.find(b => b.images.length > 0 && b.images.length <= 30);
  return small ?? ranked[ranked.length - 1];
}

type RestoreJob = { book: DaozangBookImages; hit: DaozangImageHit };

function collectJobs(): RestoreJob[] {
  const catalog = loadDaozangImageCatalog();
  if (!catalog) throw new Error('缺少 data/daozang-images.json，请先运行 npx tsx scripts/align-daozang-images.ts');
  const books = allBooks ? Object.values(catalog.books) : [pickBook(catalog)];
  const jobs: RestoreJob[] = [];
  for (const book of books) {
    for (const hit of book.images) {
      if (!hit.f || !hit.p) continue;
      if (!force && hasRestoredImage(hit.p, hit.f)) continue;
      jobs.push({ book, hit });
      if (jobs.length >= limit) return jobs;
    }
  }
  return jobs;
}

async function mapPool<T>(items: T[], n: number, fn: (item: T, i: number) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i], i);
    }
  }
  const workers = Math.min(Math.max(1, n), items.length || 1);
  await Promise.all(Array.from({ length: workers }, () => worker()));
}

async function actualMinEdge(absPath: string): Promise<number | null> {
  try {
    const meta = await sharp(absPath, { failOn: 'none' }).metadata();
    if (!meta.width || !meta.height) return null;
    return Math.min(meta.width, meta.height);
  } catch {
    return null;
  }
}

async function restoreOne(job: RestoreJob, index: number, total: number): Promise<'done' | 'tiny' | 'fail'> {
  const { book, hit } = job;
  const srcPath = originalImagePath(hit.p, hit.f);
  const destPng = restoredImagePath(hit.p, hit.f);
  if (!fs.existsSync(srcPath)) {
    console.error(`[fail] missing original ${hit.p}/${hit.f}`);
    return 'fail';
  }
  const edge = await actualMinEdge(srcPath);
  if (edge != null && edge < minEdge) {
    if (!quiet) console.log(`[tiny] ${hit.f} min=${edge}`);
    return 'tiny';
  }
  if (!quiet) {
    console.log(`[${index + 1}/${total}] 《${book.title}》 ${hit.p}/${hit.f}`);
  }
  if (dryRun) return 'done';
  try {
    const destJpg = restoredJpegPath(hit.p, hit.f);
    const originalBuf = fs.readFileSync(srcPath);
    let srcBuf = originalBuf;
    if (!localOnly) {
      const url = restoreWithLibtv(book, hit, index);
      const tmp = `${destPng}.src`;
      await download(url, tmp);
      const downloaded = fs.readFileSync(tmp);
      fs.unlinkSync(tmp);
      if (await isNoopRestore(originalBuf, downloaded)) {
        console.log(`[fallback] libtv 未真正放大，改用本地清晰化 ${hit.f}`);
      } else {
        srcBuf = downloaded;
      }
    }
    const out = await writeRestoreVariants(srcBuf, destPng, destJpg, {
      longEdge: 1024,
      cinnabar: true,
    });
    if (!quiet) {
      console.log(`[done] ${out.width}×${out.height}  ${path.basename(out.inkPng)}`);
    }
    return 'done';
  } catch (err) {
    console.error(`[fail] ${hit.f}`, err instanceof Error ? err.message.slice(0, 400) : err);
    return 'fail';
  }
}

async function main() {
  const jobs = collectJobs();
  const books = new Set(jobs.map(j => j.book.bookId)).size;
  console.log(
    `复原 jobs=${jobs.length} books=${books} engine=${localOnly ? 'local' : engine} concurrency=${concurrency} minEdge=${minEdge} dryRun=${dryRun}`,
  );
  if (jobs.length === 0) {
    console.log('没有待复原的图（已全部跳过或目录为空）');
    return;
  }

  if (engine === 'gpt-image') {
    if (dryRun) {
      jobs.forEach(j => console.log(`[dry] ${j.hit.p}/${j.hit.f}`));
      return;
    }
    restoreWithGptImage(jobs.map(j => j.hit));
    return;
  }

  let done = 0;
  let tiny = 0;
  let failed = 0;
  const started = Date.now();
  await mapPool(jobs, localOnly ? concurrency : 1, async (job, i) => {
    const result = await restoreOne(job, i, jobs.length);
    if (result === 'done') done++;
    else if (result === 'tiny') tiny++;
    else failed++;
    const processed = done + tiny + failed;
    if (processed % 50 === 0 || processed === jobs.length) {
      const elapsed = (Date.now() - started) / 1000;
      const rate = processed / Math.max(elapsed, 0.001);
      const eta = Math.round((jobs.length - processed) / Math.max(rate, 0.001));
      const line = `进度 ${processed}/${jobs.length} done=${done} tiny=${tiny} fail=${failed} ${rate.toFixed(1)}/s eta=${eta}s`;
      if (quiet) console.log(line);
      try {
        fs.appendFileSync(path.join(process.cwd(), 'data', 'images-daozang', 'restored', '_progress.log'), `${line}\n`);
      } catch {
        /* ignore */
      }
    }
  });
  const elapsed = Math.round((Date.now() - started) / 1000);
  const sampleId = jobs[0]?.book.bookId;
  const siteTitle = sampleId ? getIndex().entries.find(e => e.id === sampleId)?.title : undefined;
  console.log(`完成 done=${done} tiny=${tiny} failed=${failed} ${elapsed}s 《${siteTitle ?? jobs[0]?.book.title ?? ''}》`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
