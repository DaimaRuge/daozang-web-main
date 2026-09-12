/**
 * 扫描原图实际像素，列出最短边 < 24 的细条（复原跳过清单）。
 * 运行：npx tsx scripts/list-tiny-skips.ts
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { originalImagePath, loadDaozangImageCatalog } from '../lib/daozang-images';
import {
  TINY_SKIP_MIN_EDGE,
  tinySkipCatalogPath,
  type TinySkipCatalog,
  type TinySkipItem,
} from '../lib/daozang-tiny-skips';

interface Job {
  bookId: string;
  title: string;
  part: string;
  file: string;
  src: string;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R | null>,
): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      const row = await fn(items[idx]);
      if (row) out.push(row);
      if ((idx + 1) % 4000 === 0) {
        console.log(`扫描 ${idx + 1}/${items.length} 已列入细条 ${out.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
  return out;
}

async function main() {
  const catalog = loadDaozangImageCatalog();
  if (!catalog) throw new Error('缺少 data/daozang-images.json');

  const jobs: Job[] = [];
  for (const book of Object.values(catalog.books)) {
    for (const hit of book.images) {
      if (!hit.f || !hit.p) continue;
      jobs.push({
        bookId: book.bookId,
        title: book.title,
        part: hit.p,
        file: hit.f,
        src: originalImagePath(hit.p, hit.f),
      });
    }
  }

  const items = await mapPool<Job, TinySkipItem>(jobs, 8, async job => {
    if (!fs.existsSync(job.src)) return null;
    try {
      const meta = await sharp(job.src, { failOn: 'none' }).metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      const min = Math.min(width, height);
      if (min > 0 && min < TINY_SKIP_MIN_EDGE) {
        return {
          bookId: job.bookId,
          title: job.title,
          part: job.part,
          file: job.file,
          width,
          height,
        };
      }
    } catch {
      /* 坏文件不算细条 */
    }
    return null;
  });

  items.sort(
    (a, b) =>
      a.title.localeCompare(b.title, 'zh') ||
      a.part.localeCompare(b.part, 'zh') ||
      a.file.localeCompare(b.file, 'zh'),
  );

  const bookIds = new Set(items.map(i => i.bookId));
  const out: TinySkipCatalog = {
    version: 1,
    generatedAt: new Date().toISOString(),
    minEdge: TINY_SKIP_MIN_EDGE,
    stats: {
      catalogHits: jobs.length,
      tiny: items.length,
      books: bookIds.size,
    },
    items,
  };
  const dest = tinySkipCatalogPath();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log(`写入 ${dest} tiny=${out.stats.tiny} books=${out.stats.books} hits=${out.stats.catalogHits}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
