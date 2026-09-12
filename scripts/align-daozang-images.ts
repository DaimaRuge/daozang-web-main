/**
 * 把 Images-Daozang-Data 的插图插入点对上本站书目，写出阅读页用的索引。
 *
 * 前置：git clone https://github.com/DaimaRuge/Images-Daozang-Data data/images-daozang
 * 运行：npx tsx scripts/align-daozang-images.ts
 *
 * 产出：
 * - data/daozang-images.json     按 bookId 的插图落点（阅读页注入用，体积较大，gitignore）
 * - data/daozang-image-map.json  书目对位摘要（可提交，便于查看覆盖率）
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { getIndex } from '../lib/data';

const require = createRequire(import.meta.url);
import {
  anchorFromContext,
  catalogPath,
  imagesDataRoot,
  mapPath,
  matchTxtFileToEntry,
  stemFilename,
  type DaozangBookImages,
  type DaozangImageCatalog,
  type DaozangImageHit,
  type ImageMatchMethod,
  type InsertionMethod,
} from '../lib/daozang-images';

const ROOT = imagesDataRoot();
const DB_PATH = path.join(ROOT, 'data', 'daozang_images.db');
const INSERTIONS_PATH = path.join(ROOT, 'data', 'insertions.jsonl');
const VERIFY_SAMPLE = 40;

interface RawInsertion {
  txt_file?: string;
  txt_offset?: number | null;
  method?: string;
  part?: string;
  resolved?: string;
  width?: number;
  height?: number;
  occurrence_id?: number;
  book?: string;
}

interface RawOccurrence {
  id: number;
  ctx_before?: string;
}

function asMethod(raw: string | undefined): InsertionMethod {
  if (raw === 'before' || raw === 'after' || raw === 'book-proxy' || raw === 'no-anchor') return raw;
  return 'no-anchor';
}

function loadViaSqlite(): { insertions: RawInsertion[]; occurrences: Map<number, RawOccurrence> } | null {
  if (!fs.existsSync(DB_PATH)) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3') as new (path: string, opts?: { readonly?: boolean }) => {
      prepare: (sql: string) => { all: () => unknown[] };
      close: () => void;
    };
    const db = new Database(DB_PATH, { readonly: true });
    const rows = db.prepare(
      `SELECT i.occurrence_id, i.txt_file, i.txt_offset, i.method,
              o.part, o.resolved, o.width, o.height, o.book, o.find_before
       FROM insertions i
       JOIN occurrences o ON o.id = i.occurrence_id`,
    ).all() as (RawInsertion & { find_before?: string })[];
    db.close();
    const occurrences = new Map<number, RawOccurrence>();
    const insertions: RawInsertion[] = rows.map(row => {
      if (row.occurrence_id != null) {
        occurrences.set(row.occurrence_id, { id: row.occurrence_id, ctx_before: row.find_before });
      }
      return row;
    });
    return { insertions, occurrences };
  } catch (err) {
    console.warn('[align] sqlite 不可用，改读 insertions.jsonl：', err instanceof Error ? err.message : err);
    return null;
  }
}

function loadViaJsonl(): { insertions: RawInsertion[]; occurrences: Map<number, RawOccurrence> } {
  const lines = fs.readFileSync(INSERTIONS_PATH, 'utf-8').split(/\r?\n/).filter(Boolean);
  const insertions: RawInsertion[] = lines.map(line => JSON.parse(line) as RawInsertion);
  return { insertions, occurrences: new Map() };
}

function verifySample(
  books: Record<string, DaozangBookImages>,
): { sampled: number; located: number } {
  const candidates = Object.values(books).filter(b => b.images.length > 0).slice(0, VERIFY_SAMPLE);
  let sampled = 0;
  let located = 0;
  for (const book of candidates) {
    const contentPath = path.join(process.cwd(), 'public', 'data', 'content', `${book.bookId}.json`);
    if (!fs.existsSync(contentPath)) continue;
    const source = (JSON.parse(fs.readFileSync(contentPath, 'utf-8')) as { content: string }).content;
    const hit = book.images[0];
    sampled++;
    if (hit.o >= 0 && hit.o <= source.length) located++;
  }
  return { sampled, located };
}

function main() {
  if (!fs.existsSync(ROOT)) {
    throw new Error(`未找到 ${ROOT}，请先 clone Images-Daozang-Data 到 data/images-daozang`);
  }

  const loaded = loadViaSqlite() ?? loadViaJsonl();
  const index = getIndex();
  const byStem = new Map(index.entries.map(e => [stemFilename(e.filename), e]));

  const byTxt = new Map<string, RawInsertion[]>();
  for (const row of loaded.insertions) {
    const txt = row.txt_file?.trim();
    if (!txt) continue;
    const list = byTxt.get(txt);
    if (list) list.push(row);
    else byTxt.set(txt, [row]);
  }

  const books: Record<string, DaozangBookImages> = {};
  const unmatched: { txtFile: string; count: number }[] = [];
  const matchCounts: Record<ImageMatchMethod, number> = {
    filename: 0,
    'filename-prefix': 0,
    'filename-parent': 0,
    unmatched: 0,
  };

  for (const [txtFile, rows] of byTxt) {
    const hit = matchTxtFileToEntry(txtFile, byStem);
    if (!hit) {
      matchCounts.unmatched++;
      unmatched.push({ txtFile, count: rows.length });
      continue;
    }
    matchCounts[hit.method]++;
    const existing = books[hit.entry.id];
    const images: DaozangImageHit[] = rows
      .filter(r => r.resolved && r.method !== 'no-anchor')
      .map(r => {
        const occ = r.occurrence_id != null ? loaded.occurrences.get(r.occurrence_id) : undefined;
        const item: DaozangImageHit = {
          p: r.part || '',
          f: r.resolved || '',
          o: typeof r.txt_offset === 'number' ? r.txt_offset : 0,
          m: asMethod(r.method),
        };
        if (typeof r.width === 'number') item.w = r.width;
        if (typeof r.height === 'number') item.h = r.height;
        const anchor = occ?.ctx_before ? anchorFromContext(occ.ctx_before) : undefined;
        if (anchor) item.a = anchor;
        return item;
      });

    if (existing) {
      existing.images.push(...images);
      continue;
    }
    books[hit.entry.id] = {
      bookId: hit.entry.id,
      title: hit.entry.title,
      filename: hit.entry.filename,
      txtFile,
      match: hit.method,
      images,
    };
  }

  for (const book of Object.values(books)) {
    book.images.sort((a, b) => a.o - b.o);
  }

  const verified = verifySample(books);
  const imageHits = Object.values(books).reduce((n, b) => n + b.images.length, 0);
  const catalog: DaozangImageCatalog = {
    version: 1,
    source: 'https://github.com/DaimaRuge/Images-Daozang-Data',
    generatedAt: new Date().toISOString(),
    stats: {
      siteBooks: index.entries.length,
      txtFiles: byTxt.size,
      matchedBooks: Object.keys(books).length,
      unmatchedTxtFiles: unmatched.length,
      imageHits,
      verified,
    },
    books,
  };

  fs.mkdirSync(path.dirname(catalogPath()), { recursive: true });
  fs.writeFileSync(catalogPath(), JSON.stringify(catalog), 'utf-8');

  const map = {
    version: 1,
    generatedAt: catalog.generatedAt,
    source: catalog.source,
    stats: catalog.stats,
    matchCounts,
    unmatchedSample: unmatched.sort((a, b) => b.count - a.count).slice(0, 40),
    books: Object.values(books)
      .map(b => ({
        bookId: b.bookId,
        title: b.title,
        filename: b.filename,
        txtFile: b.txtFile,
        match: b.match,
        imageCount: b.images.length,
        href: `/text/${b.bookId}`,
      }))
      .sort((a, b) => b.imageCount - a.imageCount),
  };
  fs.writeFileSync(mapPath(), JSON.stringify(map, null, 2), 'utf-8');

  console.log('对位完成');
  console.log(`  本站书目 ${index.entries.length} 部`);
  console.log(`  索引 txt ${byTxt.size} 个`);
  console.log(`  对上 ${map.stats.matchedBooks} 部 / 未对上 ${unmatched.length} 个 txt`);
  console.log(`  可注入插图 ${imageHits} 处`);
  console.log(`  文件名全等 ${matchCounts.filename}，前缀 ${matchCounts['filename-prefix']}，父名 ${matchCounts['filename-parent']}`);
  console.log(`  锚点抽检 ${verified.located}/${verified.sampled} 能在本站正文中找到`);
  console.log(`  目录 ${catalogPath()}`);
  console.log(`  摘要 ${mapPath()}`);
  if (map.books[0]) {
    console.log(`  插图最多：《${map.books[0].title}》 ${map.books[0].imageCount} 处 → ${map.books[0].href}`);
  }
}

main();
