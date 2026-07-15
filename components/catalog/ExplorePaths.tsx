import Link from 'next/link';
import { EXPLORE_PATHS } from '@/lib/catalog-meta';

/** 探索路径卡片：为 1500+ 部典籍提供主题化入口，降低找书成本 */
export default function ExplorePaths({ onTagSelect }: { onTagSelect?: (tags: string[]) => void }) {
  return (
    <section className="mb-10">
      <h2 className="text-sm text-[var(--muted)] tracking-wider mb-4">探索路径</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {EXPLORE_PATHS.map(path => {
          const inner = (
            <>
              <span
                className="w-9 h-9 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center text-sm font-serif shrink-0"
                aria-hidden
              >
                {path.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium group-hover:text-[var(--accent)] transition-colors">{path.title}</p>
                <p className="text-xs text-[var(--muted)] mt-0.5 line-clamp-2 leading-relaxed">{path.description}</p>
              </div>
            </>
          );

          if (path.href) {
            return (
              <Link
                key={path.id}
                href={path.href}
                className="group flex gap-3 p-3 bg-[var(--card)] border border-[var(--border)] rounded-lg hover:border-[var(--accent-light)] hover:shadow-[var(--shadow-soft)] transition-all"
              >
                {inner}
              </Link>
            );
          }

          return (
            <button
              key={path.id}
              type="button"
              onClick={() => onTagSelect?.(path.tags)}
              className="group flex gap-3 p-3 bg-[var(--card)] border border-[var(--border)] rounded-lg hover:border-[var(--accent-light)] hover:shadow-[var(--shadow-soft)] transition-all text-left"
            >
              {inner}
            </button>
          );
        })}
      </div>
    </section>
  );
}
