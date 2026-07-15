'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DaozangEntry } from '@/lib/data';
import { CategoryMeta } from '@/lib/catalog-meta';
import {
  EntryTag,
  SortKey,
  filterByQuery,
  filterByTags,
  getEntryTags,
  sortEntries,
} from '@/lib/entry-tags';
import EntryCard from './EntryCard';
import ExplorePaths from './ExplorePaths';

const ALL_TAGS: EntryTag[] = ['经典', '修炼', '内丹', '科仪', '咒诀', '符箓', '斋醮', '注释', '文集', '续藏'];
const PAGE_SIZE = 24;

interface Props {
  entries: DaozangEntry[];
  meta: CategoryMeta;
  cat: string;
  sub: string;
  subcategories: string[];
}

/**
 * 目录探索器（客户端）：筛选、排序、标签、子类切换、分页。
 * 服务端传入当前部类全部典籍，交互在此完成，避免每次筛选都往返服务器。
 */
export default function CatalogExplorer({ entries, meta, cat, sub, subcategories }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState<EntryTag[]>([]);
  const [sort, setSort] = useState<SortKey>('default');
  const [collection, setCollection] = useState<'all' | '正统' | '续'>('all');
  const [page, setPage] = useState(1);
  const [showShortOnly, setShowShortOnly] = useState(false);

  const filtered = useMemo(() => {
    let list = entries;
    if (collection === '正统') list = list.filter(e => e.collection.includes('正统'));
    if (collection === '续') list = list.filter(e => e.collection.includes('续') || e.category === '');
    if (showShortOnly) list = list.filter(e => e.lineCount < 200);
    list = filterByTags(list, activeTags);
    list = filterByQuery(list, query);
    return sortEntries(list, sort);
  }, [entries, activeTags, query, sort, collection, showShortOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageEntries = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleTag = (tag: EntryTag) => {
    setActiveTags(prev => (prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]));
    setPage(1);
  };

  const navigateSub = (nextSub: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('cat', cat);
    if (nextSub) params.set('sub', nextSub);
    else params.delete('sub');
    params.delete('page');
    router.push(`/catalog?${params.toString()}`);
    setPage(1);
  };

  const tagCounts = useMemo(() => {
    const counts = new Map<EntryTag, number>();
    for (const e of entries) {
      for (const t of getEntryTags(e)) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return counts;
  }, [entries]);

  return (
    <div>
      <ExplorePaths
        onTagSelect={tags => {
          setActiveTags(tags as EntryTag[]);
          if (tags.length === 0) setShowShortOnly(true);
          setPage(1);
        }}
      />

      {/* 子类快速切换 */}
      {subcategories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            type="button"
            onClick={() => navigateSub('')}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
              !sub ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            全部
          </button>
          {subcategories.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => navigateSub(s)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                sub === s ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* 筛选工具栏 */}
      <div className="sticky top-0 z-10 -mx-1 px-1 py-3 mb-4 bg-[var(--bg)]/95 backdrop-blur-sm border-b border-[var(--border)]">
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1 max-w-md">
            <input
              type="search"
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(1); }}
              placeholder={`在${meta.name}中搜索…`}
              className="w-full pl-9 pr-3 py-2 text-sm bg-[var(--card)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-[var(--accent)]"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={sort}
              onChange={e => { setSort(e.target.value as SortKey); setPage(1); }}
              className="text-xs px-2 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg"
              aria-label="排序方式"
            >
              <option value="default">默认顺序</option>
              <option value="title">按名称</option>
              <option value="lines-asc">篇幅由短到长</option>
              <option value="lines-desc">篇幅由长到短</option>
            </select>

            <select
              value={collection}
              onChange={e => { setCollection(e.target.value as typeof collection); setPage(1); }}
              className="text-xs px-2 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg"
              aria-label="藏本筛选"
            >
              <option value="all">全部藏本</option>
              <option value="正统">正统道藏</option>
              <option value="续">续道藏</option>
            </select>
          </div>
        </div>

        {/* 标签云 */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {ALL_TAGS.filter(t => (tagCounts.get(t) ?? 0) > 0).map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                activeTags.includes(tag)
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                  : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent-light)]'
              }`}
            >
              {tag}
              <span className="ml-1 opacity-60">{tagCounts.get(tag)}</span>
            </button>
          ))}
          {(activeTags.length > 0 || showShortOnly || query) && (
            <button
              type="button"
              onClick={() => { setActiveTags([]); setQuery(''); setShowShortOnly(false); setPage(1); }}
              className="text-xs px-2.5 py-1 text-[var(--cinnabar)] hover:underline"
            >
              清除筛选
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-[var(--muted)] mb-4">
        显示 {filtered.length.toLocaleString('zh-CN')} / {entries.length.toLocaleString('zh-CN')} 部
        {page > 1 || totalPages > 1 ? ` · 第 ${page}/${totalPages} 页` : ''}
      </p>

      {pageEntries.length === 0 ? (
        <div className="text-center py-16 text-sm text-[var(--muted)]">
          <p>没有匹配的典籍。</p>
          <button type="button" onClick={() => { setActiveTags([]); setQuery(''); setShowShortOnly(false); }} className="mt-3 text-[var(--accent)] hover:underline text-xs">
            清除筛选条件
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pageEntries.map(entry => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-10">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--card)] disabled:opacity-40 transition-colors"
          >
            上一页
          </button>
          <span className="text-sm text-[var(--muted)]">{page} / {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--card)] disabled:opacity-40 transition-colors"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
