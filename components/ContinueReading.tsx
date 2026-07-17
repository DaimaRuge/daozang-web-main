'use client';

import Link from 'next/link';
import { ReadingProgress, getRecentReading } from '@/lib/user-data';
import { useLocalData } from '@/lib/use-local-data';
import { readingProgressLabel, readingResumeHref } from '@/lib/reading-url';

/** SSR 快照用的稳定空数组（避免每次渲染生成新引用） */
const EMPTY: ReadingProgress[] = [];

/**
 * 首页「继续阅读」条。
 *
 * 为什么单独拆成客户端组件：首页整体是服务端组件（利于 SEO 与静态化），
 * 但「上次读到哪」只存在于用户本地，必须在客户端读取。
 * 把这一小块隔离出来，避免整个首页为此退化成客户端渲染。
 * 无阅读记录时渲染为空，不占据版面（非打扰式）。
 */
export default function ContinueReading() {
  const [recent] = useLocalData(() => getRecentReading(3), EMPTY);

  if (recent.length === 0) return null;

  return (
    <section className="mb-16 animate-fade-in">
      <h2 className="text-lg font-serif tracking-wider mb-6 text-center text-[var(--muted)]">继续阅读</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {recent.map(r => (
          <Link
            key={r.bookId}
            href={readingResumeHref(r)}
            className="block px-5 py-4 bg-[var(--card)] border border-[var(--border)] rounded-lg hover:bg-[var(--card-hover)] transition-all group"
          >
            <div className="text-sm font-medium group-hover:text-[var(--accent)] transition-colors truncate">
              {r.bookTitle}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 h-1 bg-[var(--border)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--accent-light)]" style={{ width: `${r.scrollProgress * 100}%` }} />
              </div>
              <span className="text-xs text-[var(--muted)] shrink-0">{readingProgressLabel(r)}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
