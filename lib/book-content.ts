/**
 * 典籍结构化读取（服务端）。
 *
 * 为什么独立于 lib/data.ts：data 只给原文与目录索引，本模块负责
 * 「原文 → 解析 → 校正 → 分页」这条阅读器用的装配线。
 * getContentById 已改为 async（见 lib/public-data.ts），本模块同步跟进，
 * 避免在 Vercel 上同步 fs 读不到被排除出函数包的 content 目录。
 */

import { getContentById, getEntryById } from '@/lib/data';
import { parseText } from '@/lib/text-parser';
import { applyOverrides } from '@/lib/parser-overrides';
import { injectRitualIllustrations } from '@/lib/ritual-illustrations';
import { ParsedBook } from '@/lib/content-schema';
import { paginateBlocks, BookPage } from '@/lib/book-pagination';
import { enrichTocWithPages, EnrichedTocItem } from '@/lib/toc-enriched';

export async function loadParsedBook(bookId: string): Promise<ParsedBook | null> {
  const entry = getEntryById(bookId);
  if (!entry) return null;
  const content = await getContentById(bookId);
  return injectRitualIllustrations(
    applyOverrides(parseText(content, bookId, entry.title)),
  );
}

export async function getBookPages(bookId: string): Promise<{ parsed: ParsedBook; pages: BookPage[] } | null> {
  const parsed = await loadParsedBook(bookId);
  if (!parsed) return null;
  return { parsed, pages: paginateBlocks(parsed.blocks) };
}

export async function getEnrichedToc(bookId: string): Promise<EnrichedTocItem[] | null> {
  const data = await getBookPages(bookId);
  if (!data) return null;
  return enrichTocWithPages(data.parsed.toc, data.parsed.blocks, data.pages);
}

/** PRD 页码为 1-based；内部为 0-based */
export function pageNumToIndex(pageNum: number, totalPages: number): number {
  const idx = pageNum - 1;
  if (idx < 0 || idx >= totalPages) return -1;
  return idx;
}
