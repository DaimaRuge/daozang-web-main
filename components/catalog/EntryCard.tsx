import Link from 'next/link';
import { DaozangEntry } from '@/lib/data';
import { getEntryTags, getSizeLabel } from '@/lib/entry-tags';

/** 典籍卡片：比纯文本列表更有「藏书阁」质感，展示标签与摘要辅助决策 */
export default function EntryCard({ entry }: { entry: DaozangEntry }) {
  const tags = getEntryTags(entry);
  const size = getSizeLabel(entry.lineCount);

  return (
    <Link
      href={`/text/${entry.id}`}
      className="group flex flex-col h-full p-4 bg-[var(--card)] border border-[var(--border)] rounded-lg hover:border-[var(--accent-light)] hover:shadow-[var(--shadow-soft)] transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-serif leading-snug group-hover:text-[var(--accent)] transition-colors line-clamp-2">
          {entry.title}
        </h3>
        <span className="text-[10px] text-[var(--muted)] shrink-0 px-1.5 py-0.5 border border-[var(--border)] rounded">
          {size}
        </span>
      </div>

      {entry.preview && (
        <p className="text-xs text-[var(--muted)] leading-relaxed line-clamp-2 mb-3 flex-1">
          {entry.preview.slice(0, 80)}…
        </p>
      )}

      <div className="flex flex-wrap gap-1 mb-2">
        {tags.slice(0, 3).map(tag => (
          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg)] text-[var(--accent)] border border-[var(--accent-light)]">
            {tag}
          </span>
        ))}
      </div>

      <div className="text-[10px] text-[var(--muted)] flex flex-wrap gap-x-2 gap-y-0.5 mt-auto pt-2 border-t border-[var(--border)]">
        <span>{entry.collection}</span>
        {entry.subcategory && <span>· {entry.subcategory}</span>}
        {entry.author && <span>· {entry.author}</span>}
        <span>· {entry.lineCount} 行</span>
      </div>
    </Link>
  );
}
