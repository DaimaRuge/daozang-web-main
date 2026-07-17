import type { ReadingProgress } from './user-data';

/** 将阅读进度同步到服务端（失败静默，本地仍为准） */
export async function syncProgressToServer(
  progress: Omit<ReadingProgress, 'updatedAt'> & { readingDurationMs?: number },
): Promise<void> {
  try {
    await fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookId: progress.bookId,
        bookTitle: progress.bookTitle,
        category: progress.category,
        blockId: progress.blockId,
        pageIndex: progress.pageIndex,
        pageNum: progress.pageIndex != null ? progress.pageIndex + 1 : undefined,
        totalPages: progress.totalPages,
        volumeBlockId: progress.volumeBlockId,
        volumeTitle: progress.volumeTitle,
        scrollProgress: progress.scrollProgress,
        readingDurationMs: progress.readingDurationMs,
        platform: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 80) : 'ssr',
        timestamp: Date.now(),
      }),
      keepalive: true,
    });
  } catch {
    // 离线或未部署 API 时不打断阅读
  }
}
