/**
 * 复原时跳过的细条原图清单（最短边 < minEdge）。
 * 目录 w/h 不可信，以生成脚本读到的实际像素为准。
 */
import fs from 'fs';
import path from 'path';

export const TINY_SKIP_MIN_EDGE = 24;

export type TinySkipShape = 'strip-h' | 'strip-v' | 'stamp';

export interface TinySkipItem {
  bookId: string;
  title: string;
  part: string;
  file: string;
  width: number;
  height: number;
}

export interface TinySkipCatalog {
  version: 1;
  generatedAt: string;
  minEdge: number;
  stats: {
    catalogHits: number;
    tiny: number;
    books: number;
  };
  items: TinySkipItem[];
}

export interface TinySkipFilters {
  q?: string;
  bookId?: string;
  part?: string;
  shape?: TinySkipShape;
}

const CATALOG_PATH = path.join(process.cwd(), 'data', 'daozang-tiny-skips.json');

let cache: { mtimeMs: number; data: TinySkipCatalog } | null = null;

export function tinySkipCatalogPath(): string {
  return CATALOG_PATH;
}

export function loadTinySkipCatalog(): TinySkipCatalog | null {
  try {
    const st = fs.statSync(CATALOG_PATH);
    if (cache && cache.mtimeMs === st.mtimeMs) return cache.data;
    const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8')) as TinySkipCatalog;
    cache = { mtimeMs: st.mtimeMs, data };
    return data;
  } catch {
    cache = null;
    return null;
  }
}

export function tinySkipShape(item: Pick<TinySkipItem, 'width' | 'height'>): TinySkipShape {
  if (item.width >= item.height * 3) return 'strip-h';
  if (item.height >= item.width * 3) return 'strip-v';
  return 'stamp';
}

export function tinySkipDisplaySize(
  item: Pick<TinySkipItem, 'width' | 'height'>,
  minDisplay = 72,
): { width: number; height: number } {
  const min = Math.min(item.width, item.height) || 1;
  const scale = Math.max(4, Math.ceil(minDisplay / min));
  return { width: item.width * scale, height: item.height * scale };
}

export function filterTinySkips(
  items: TinySkipItem[],
  filters: TinySkipFilters = {},
): TinySkipItem[] {
  const q = filters.q?.trim().toLowerCase() ?? '';
  const bookId = filters.bookId?.trim() ?? '';
  const part = filters.part?.trim() ?? '';
  const shape = filters.shape;
  return items.filter(item => {
    if (bookId && item.bookId !== bookId) return false;
    if (part && item.part !== part) return false;
    if (shape && tinySkipShape(item) !== shape) return false;
    if (!q) return true;
    const hay = `${item.title} ${item.file} ${item.part}`.toLowerCase();
    return hay.includes(q);
  });
}

export function tinySkipBookOptions(items: TinySkipItem[]): { bookId: string; title: string; count: number }[] {
  const map = new Map<string, { title: string; count: number }>();
  for (const item of items) {
    const cur = map.get(item.bookId);
    if (cur) cur.count += 1;
    else map.set(item.bookId, { title: item.title, count: 1 });
  }
  return [...map.entries()]
    .map(([bookId, v]) => ({ bookId, title: v.title, count: v.count }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, 'zh'));
}

export function tinySkipPartOptions(items: TinySkipItem[]): { part: string; count: number }[] {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.part, (map.get(item.part) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([part, count]) => ({ part, count }))
    .sort((a, b) => b.count - a.count || a.part.localeCompare(b.part, 'zh'));
}
