import { getContentById, getEntryById } from '@/lib/data';
import { parseText } from '@/lib/text-parser';
import { applyOverrides } from '@/lib/parser-overrides';
import { injectRitualIllustrations } from '@/lib/ritual-illustrations';
import { ParsedBook } from '@/lib/content-schema';
import { paginateBlocks, BookPage } from '@/lib/book-pagination';
import { enrichTocWithPages, EnrichedTocItem } from '@/lib/toc-enriched';

export function loadParsedBook(bookId: string): ParsedBook | null {
  const entry = getEntryById(bookId);
  if (!entry) return null;
  const content = getContentById(bookId);
  return injectRitualIllustrations(
    applyOverrides(parseText(content, bookId, entry.title)),
  );
}

export function getBookPages(bookId: string): { parsed: ParsedBook; pages: BookPage[] } | null {
  const parsed = loadParsedBook(bookId);
  if (!parsed) return null;
  return { parsed, pages: paginateBlocks(parsed.blocks) };
}

export function getEnrichedToc(bookId: string): EnrichedTocItem[] | null {
  const data = getBookPages(bookId);
  if (!data) return null;
  return enrichTocWithPages(data.parsed.toc, data.parsed.blocks, data.pages);
}

/** PRD 页码为 1-based；内部为 0-based */
export function pageNumToIndex(pageNum: number, totalPages: number): number {
  const idx = pageNum - 1;
  if (idx < 0 || idx >= totalPages) return -1;
  return idx;
}
