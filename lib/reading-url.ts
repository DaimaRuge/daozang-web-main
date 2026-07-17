import type { ReadingProgress } from './user-data';

/** 继续阅读链接：优先带 ?page=&volume=（PRD §5） */
export function readingResumeHref(p: ReadingProgress): string {
  const base = `/text/${p.bookId}`;
  if (p.pageIndex != null && p.pageIndex >= 0) {
    const params = new URLSearchParams();
    params.set('page', String(p.pageIndex + 1));
    if (p.volumeBlockId) params.set('volume', p.volumeBlockId);
    return `${base}?${params.toString()}`;
  }
  if (p.blockId) return `${base}#${p.blockId}`;
  return base;
}

export function readingProgressLabel(p: ReadingProgress): string {
  if (p.pageIndex != null && p.totalPages) {
    return `第 ${p.pageIndex + 1}/${p.totalPages} 页`;
  }
  return `${Math.round(p.scrollProgress * 100)}%`;
}
