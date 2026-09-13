/**
 * 道藏原书插图索引层（仅服务端）。
 *
 * 数据来自独立仓库 Images-Daozang-Data：网页版道藏的符箓/插图标记
 * 已对位到与本站相同的 txt 书目。本模块负责：
 * 1. 把 txt 文件名对上本站 bookId（sha256(filename) 前 16 位）；
 * 2. 按字符偏移 / 前后文锚点插入 image 块，不改写不可变原文；
 * 3. 若本地已有 AI 高清复原图，优先引用并显式标注。
 *
 * 内容边界：原扫描图是典籍组成部分，不是 AI 配图；复原图必须标 AI。
 */

import fs from 'fs';
import path from 'path';
import { ContentBlock, ParsedBook } from './content-schema';
import type { DaozangEntry } from './data';
import { daozangImageUrl, restoredStem } from './daozang-image-url';
import { hasWebCinnabar, webCinnabarFile } from './daozang-web-images';

export { daozangImageUrl, parseDaozangImageUrl, restoredStem } from './daozang-image-url';

export const DAOZANG_IMAGES_PARSER = 'daozang-scan';
export const DAOZANG_RESTORED_PARSER = 'daozang-restored';

export type ImageMatchMethod =
  | 'filename'
  | 'filename-prefix'
  | 'filename-parent'
  | 'unmatched';

export type InsertionMethod = 'before' | 'after' | 'book-proxy' | 'no-anchor';

/** 单张插图在一部经文中的落点（字段名缩短以压缩 4 万+条索引） */
export interface DaozangImageHit {
  /** 部名，对应 data/images/<part>/ */
  p: string;
  /** 原图文件名 */
  f: string;
  /** 对位 txt 中的 Unicode 字符偏移 */
  o: number;
  /** 对位方法 */
  m: InsertionMethod;
  w?: number;
  h?: number;
  /** 图前 CJK 锚点（用于偏移漂移时在本站正文里重定位） */
  a?: string;
}

export interface DaozangBookImages {
  bookId: string;
  title: string;
  filename: string;
  txtFile: string;
  match: ImageMatchMethod;
  images: DaozangImageHit[];
}

export interface DaozangImageCatalog {
  version: 1;
  source: string;
  generatedAt: string;
  stats: {
    siteBooks: number;
    txtFiles: number;
    matchedBooks: number;
    unmatchedTxtFiles: number;
    imageHits: number;
    verified: { sampled: number; located: number };
  };
  books: Record<string, DaozangBookImages>;
}

const CATALOG_PATH = path.join(process.cwd(), 'data', 'daozang-images.json');
const MAP_PATH = path.join(process.cwd(), 'data', 'daozang-image-map.json');
const DATA_ROOT = path.join(process.cwd(), 'data', 'images-daozang');
const RESTORED_ROOT = path.join(process.cwd(), 'data', 'images-daozang', 'restored');

let catalogCache: DaozangImageCatalog | null | undefined;

export function catalogPath(): string {
  return CATALOG_PATH;
}

export function mapPath(): string {
  return MAP_PATH;
}

export function imagesDataRoot(): string {
  return DATA_ROOT;
}

export function originalImagePath(part: string, file: string): string {
  return path.join(DATA_ROOT, 'data', 'images', part, file);
}

export type DaozangImageKind = 'scan' | 'ink' | 'cinnabar' | 'restored';

export interface RestoredPresence {
  ink: boolean;
  cinnabar: boolean;
  restored: boolean;
}

export type RestoredLookup = (part: string, file: string) => RestoredPresence;

export function restoredImagePath(part: string, file: string): string {
  return path.join(RESTORED_ROOT, part, `${restoredStem(file)}.png`);
}

export function restoredInkPath(part: string, file: string): string {
  return path.join(RESTORED_ROOT, part, `${restoredStem(file)}.ink.png`);
}

export function restoredCinnabarPath(part: string, file: string): string {
  return path.join(RESTORED_ROOT, part, `${restoredStem(file)}.cinnabar.png`);
}

export function restoredJpegPath(part: string, file: string): string {
  return path.join(RESTORED_ROOT, part, `${restoredStem(file)}.jpg`);
}

export function detectRestoredPresence(part: string, file: string): RestoredPresence {
  try {
    return {
      ink: fs.existsSync(restoredInkPath(part, file)),
      cinnabar: fs.existsSync(restoredCinnabarPath(part, file)),
      restored: fs.existsSync(restoredImagePath(part, file)),
    };
  } catch {
    return { ink: false, cinnabar: false, restored: false };
  }
}

export function hasRestoredImage(part: string, file: string): boolean {
  const p = detectRestoredPresence(part, file);
  return p.ink || p.cinnabar || p.restored;
}

export function isTalismanContext(title: string, nearbyText = ''): boolean {
  return /符|籙|箓|印/.test(`${title}${nearbyText}`);
}

export function classifyRequestedFile(file: string): DaozangImageKind | null {
  const lower = file.toLowerCase();
  if (lower.endsWith('.ink.png') || lower.endsWith('.ink.webp')) return 'ink';
  if (lower.endsWith('.cinnabar.png') || lower.endsWith('.cinnabar.webp')) return 'cinnabar';
  if (lower.endsWith('.png')) return 'restored';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp')) return 'scan';
  return null;
}

/**
 * 按请求文件名精确取图：jpg 永远是原扫描，不会被 restored 顶替。
 * `exists` 供单测注入。
 */
export function resolveDaozangImageFile(
  part: string,
  file: string,
  exists: (absPath: string) => boolean = p => fs.existsSync(p),
): { absPath: string; kind: DaozangImageKind } | null {
  const kind = classifyRequestedFile(file);
  if (!kind) return null;
  const absPath =
    kind === 'scan'
      ? originalImagePath(part, file)
      : kind === 'ink'
        ? restoredInkPath(part, file)
        : kind === 'cinnabar'
          ? restoredCinnabarPath(part, file)
          : restoredImagePath(part, file);
  if (!exists(absPath)) return null;
  return { absPath, kind };
}

export function loadDaozangImageCatalog(): DaozangImageCatalog | null {
  if (catalogCache) return catalogCache;
  try {
    catalogCache = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8')) as DaozangImageCatalog;
    return catalogCache;
  } catch {
    return null;
  }
}

export function getBookImages(bookId: string): DaozangBookImages | undefined {
  return loadDaozangImageCatalog()?.books[bookId];
}

/** 同书已落地复原图，按索引顺序。 */
export function restoredImagesForBook(bookId: string): { part: string; file: string }[] {
  const book = getBookImages(bookId);
  if (!book) return [];
  const out: { part: string; file: string }[] = [];
  for (const hit of book.images) {
    if (!hit.f || !hit.p) continue;
    if (!hasRestoredImage(hit.p, hit.f)) continue;
    out.push({ part: hit.p, file: hit.f });
  }
  return out;
}

export function stemFilename(filename: string): string {
  return filename.replace(/\.txt$/i, '');
}

/** 只保留汉字，与 Images-Daozang-Data 的对位脚本同一口径 */
export function cjkOnly(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if ((cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf)) out += ch;
  }
  return out;
}

export function anchorFromContext(ctxBefore: string, max = 16): string {
  const cjk = cjkOnly(ctxBefore);
  return cjk.slice(-max);
}

/**
 * txt 库文件名 → 本站条目。
 * 优先全等；其次本站文件名多了作者后缀、或 txt 多了卷次后缀（且唯一）。
 */
export function matchTxtFileToEntry(
  txtFile: string,
  byStem: Map<string, DaozangEntry>,
): { entry: DaozangEntry; method: ImageMatchMethod } | null {
  const stem = stemFilename(txtFile);
  const exact = byStem.get(stem);
  if (exact) return { entry: exact, method: 'filename' };

  const prefixed: DaozangEntry[] = [];
  const parents: DaozangEntry[] = [];
  for (const [key, entry] of byStem) {
    if (key.startsWith(`${stem}-`)) prefixed.push(entry);
    if (stem.startsWith(`${key}-`)) parents.push(entry);
  }
  if (prefixed.length === 1) return { entry: prefixed[0], method: 'filename-prefix' };
  if (parents.length === 1) return { entry: parents[0], method: 'filename-parent' };
  return null;
}

export function offsetToLine(source: string, offset: number): number {
  const clamped = Math.max(0, Math.min(offset, source.length));
  let line = 0;
  for (let i = 0; i < clamped; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

/** 插入点来自同一套 txt 库，优先信任字符偏移；锚点只在偏移越界时兜底 */
export function locateCharOffset(source: string, hit: Pick<DaozangImageHit, 'o' | 'a'>): number {
  if (hit.o >= 0 && hit.o <= source.length) return hit.o;
  const anchor = hit.a;
  if (anchor && anchor.length >= 6) {
    const idx = source.indexOf(anchor);
    if (idx >= 0) return idx + anchor.length;
  }
  return Math.max(0, Math.min(Math.max(0, hit.o), source.length));
}

function findHostBlock(blocks: ContentBlock[], line: number): ContentBlock | undefined {
  let host: ContentBlock | undefined;
  for (const block of blocks) {
    if (block.type === 'image' || block.type === 'image-caption') continue;
    if (block.sourceStart <= line) host = block;
    if (block.sourceStart > line) break;
  }
  return host;
}

function displayRestoredFile(hit: DaozangImageHit, presence: RestoredPresence, preferCinnabar: boolean): string {
  const stem = restoredStem(hit.f);
  if (preferCinnabar && presence.cinnabar) return `${stem}.cinnabar.png`;
  if (presence.ink) return `${stem}.ink.png`;
  if (presence.restored) return `${stem}.png`;
  return hit.f;
}

/**
 * 在解析结果中按锚点插入原书插图。展示复原 PNG（若有），始终保留原扫描 URL 供对照。
 * `bookImages` / `restoredLookup` 供单测注入；线上缺省读目录与磁盘。
 */
export function injectDaozangImages(
  parsed: ParsedBook,
  source: string,
  bookImages?: DaozangBookImages,
  restoredLookup: RestoredLookup = detectRestoredPresence,
): ParsedBook {
  const book = bookImages ?? getBookImages(parsed.bookId);
  if (!book || book.images.length === 0) return parsed;

  const byHost = new Map<string, DaozangImageHit[]>();
  for (const hit of book.images) {
    if (hit.m === 'no-anchor' || !hit.f) continue;
    const offset = locateCharOffset(source, hit);
    const line = offsetToLine(source, offset);
    const host = findHostBlock(parsed.blocks, line);
    if (!host) continue;
    const list = byHost.get(host.id);
    if (list) list.push(hit);
    else byHost.set(host.id, [hit]);
  }
  if (byHost.size === 0) return parsed;

  const blocks: ContentBlock[] = [];
  let seq = 0;
  for (const block of parsed.blocks) {
    blocks.push(block);
    const hits = byHost.get(block.id);
    if (!hits) continue;
    hits.sort((a, b) => a.o - b.o);
    for (const hit of hits) {
      const presence = restoredLookup(hit.p, hit.f);
      const webCinnabar = hasWebCinnabar(hit.p, hit.f);
      const restored = presence.ink || presence.cinnabar || presence.restored || webCinnabar;
      const parser = restored ? DAOZANG_RESTORED_PARSER : DAOZANG_IMAGES_PARSER;
      const imgId = `${block.id}-dzimg-${seq++}`;
      const preferCinnabar = isTalismanContext(book.title, block.content);
      const fileForUrl = webCinnabar
        ? webCinnabarFile(hit.f)
        : restored
          ? displayRestoredFile(hit, presence, preferCinnabar)
          : hit.f;
      const stem = restoredStem(hit.f);
      const originalSrc = daozangImageUrl(hit.p, hit.f);
      blocks.push({
        id: imgId,
        type: 'image',
        content: daozangImageUrl(hit.p, fileForUrl),
        originalSrc,
        inkSrc: presence.ink ? daozangImageUrl(hit.p, `${stem}.ink.png`) : undefined,
        cinnabarSrc: webCinnabar
          ? daozangImageUrl(hit.p, webCinnabarFile(hit.f))
          : presence.cinnabar
            ? daozangImageUrl(hit.p, `${stem}.cinnabar.png`)
            : undefined,
        sourceStart: block.sourceStart,
        sourceEnd: block.sourceEnd,
        confidence: 1,
        parser,
      });
      const size = hit.w && hit.h ? `，原扫描 ${hit.w}×${hit.h}` : '';
      const caption = webCinnabar
        ? `《${book.title}》原书插图「${hit.f}」的网页压缩复原（朱砂透明 WebP）${size}。悬停或长按对照原扫描。高清母版不在本站公开。`
        : restored
          ? `《${book.title}》原书插图「${hit.f}」的高清复原 PNG（透明底）${size}。悬停或长按对照原扫描。`
          : `《${book.title}》原书插图「${hit.f}」${size}。低清扫描线稿，非 AI 生成。`;
      blocks.push({
        id: `${imgId}-cap`,
        type: 'image-caption',
        content: caption,
        sourceStart: block.sourceStart,
        sourceEnd: block.sourceEnd,
        confidence: 1,
        parser,
      });
    }
  }

  return {
    ...parsed,
    blocks,
    stats: { ...parsed.stats, totalBlocks: blocks.length },
  };
}
