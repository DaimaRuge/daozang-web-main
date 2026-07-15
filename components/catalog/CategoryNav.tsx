'use client';

import Link from 'next/link';
import Image from 'next/image';
import { CategoryInfo } from '@/lib/data';
import { getCategoryMeta } from '@/lib/catalog-meta';

/** 部类导航侧栏（桌面）/ 横滑条（移动）：配图缩略增强方位感 */
export default function CategoryNav({
  categories,
  activeCat,
  activeSub,
}: {
  categories: CategoryInfo[];
  activeCat: string;
  activeSub: string;
}) {
  return (
    <>
      {/* 移动端：横滑部类选择 */}
      <div className="md:hidden flex gap-2 overflow-x-auto pb-2 mb-6 -mx-1 px-1 scrollbar-hide">
        {categories.map(c => {
          const meta = getCategoryMeta(c.name);
          const active = activeCat === c.name;
          return (
            <Link
              key={c.name}
              href={`/catalog?cat=${encodeURIComponent(c.name)}`}
              className={`flex items-center gap-2 shrink-0 px-3 py-2 rounded-lg border transition-all ${
                active ? 'border-[var(--accent)] bg-[var(--card)]' : 'border-[var(--border)] bg-[var(--card)]/50'
              }`}
            >
              <span
                className="w-6 h-6 rounded-full shrink-0 overflow-hidden relative"
                style={{ backgroundColor: meta.accent }}
              >
                <Image src={meta.heroImage} alt="" fill sizes="24px" className="object-cover opacity-80" />
              </span>
              <span className={`text-xs whitespace-nowrap ${active ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`}>
                {meta.name || '续道藏'} ({c.count})
              </span>
            </Link>
          );
        })}
      </div>

      {/* 桌面端：纵向导航 */}
      <nav className="hidden md:block space-y-1 sticky top-8 max-h-[85vh] overflow-y-auto pr-2">
        <p className="text-xs text-[var(--muted)] tracking-wider mb-3">三洞四辅</p>
        {categories.map(c => {
          const meta = getCategoryMeta(c.name);
          const active = activeCat === c.name;
          return (
            <div key={c.name}>
              <Link
                href={`/catalog?cat=${encodeURIComponent(c.name)}`}
                className={`flex items-center gap-2.5 py-2 px-2 rounded-lg transition-colors ${
                  active ? 'bg-[var(--card)] text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--card)]/50'
                }`}
              >
                <span className="w-8 h-8 rounded-md shrink-0 overflow-hidden relative border border-[var(--border)]">
                  <Image src={meta.heroImage} alt="" fill sizes="32px" className="object-cover" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm truncate">{meta.name || '续道藏'}</div>
                  <div className="text-[10px] opacity-60">{c.count} 部</div>
                </div>
              </Link>
              {active && c.subcategories.length > 0 && (
                <div className="ml-10 mt-1 space-y-0.5 border-l border-[var(--border)] pl-3">
                  <Link
                    href={`/catalog?cat=${encodeURIComponent(c.name)}`}
                    className={`block py-1 text-xs ${!activeSub ? 'text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
                  >
                    全部
                  </Link>
                  {c.subcategories.map(s => (
                    <Link
                      key={s}
                      href={`/catalog?cat=${encodeURIComponent(c.name)}&sub=${encodeURIComponent(s)}`}
                      className={`block py-1 text-xs truncate ${activeSub === s ? 'text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
                    >
                      {s}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </>
  );
}
