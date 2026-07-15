import Link from 'next/link';
import { searchEntries } from '@/lib/data';
import { searchFullText } from '@/lib/fulltext-search';

/**
 * 搜索页（服务端组件）。
 * 两种模式：书名搜索（标题/作者/预览，默认）与全文搜索（正文命中 + 上下文摘要）。
 * 模式通过 URL 参数切换，保证搜索结果可分享、可收藏、可被搜索引擎索引。
 */

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string; mode?: string }>;
}

/** 关键词高亮：把摘要按命中词拆分后用 <mark> 包裹（服务端渲染，无需客户端 JS） */
function Highlight({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword) return <>{text}</>;
  const parts = text.split(keyword);
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <mark className="bg-[var(--highlight)] text-[var(--text)] rounded-sm px-0.5">{keyword}</mark>
          )}
        </span>
      ))}
    </>
  );
}

export default async function SearchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = params.q || '';
  const page = parseInt(params.page || '1', 10);
  const mode = params.mode === 'full' ? 'full' : 'meta';
  const pageSize = 20;

  const meta = mode === 'meta' && query ? searchEntries(query, page, pageSize) : { results: [], total: 0 };
  const full = mode === 'full' && query ? searchFullText(query, page, pageSize) : { results: [], total: 0 };
  const total = mode === 'full' ? full.total : meta.total;
  const totalPages = Math.ceil(total / pageSize);

  const pageHref = (p: number) =>
    `?q=${encodeURIComponent(query)}&mode=${mode}&page=${p}`;

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-serif tracking-wider mb-8">搜索</h1>

      <form action="/search" method="get" className="mb-4">
        <input type="hidden" name="mode" value={mode} />
        <div className="relative">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder={mode === 'full' ? '搜索经文正文内容…' : '输入经文名称、作者或关键词…'}
            className="w-full px-5 py-3 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
          <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--accent)] transition-colors" aria-label="搜索">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          </button>
        </div>
      </form>

      {/* 模式切换：URL 驱动，可分享 */}
      <div className="flex gap-1 mb-6 text-sm" role="tablist">
        {([['meta', '书名搜索'], ['full', '全文搜索']] as const).map(([m, label]) => (
          <Link
            key={m}
            href={`?q=${encodeURIComponent(query)}&mode=${m}`}
            role="tab"
            aria-selected={mode === m}
            className={`px-4 py-1.5 rounded-full border transition-colors ${
              mode === m
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {query && (
        <p className="text-sm text-[var(--muted)] mb-6">
          {mode === 'full' ? '全文' : '书名'}搜索「{query}」，找到 {total} {mode === 'full' ? '部含此内容的典籍' : '条结果'}
        </p>
      )}

      {/* 书名搜索结果 */}
      {mode === 'meta' && meta.results.length > 0 && (
        <div className="space-y-1">
          {meta.results.map(entry => (
            <Link
              key={entry.id}
              href={`/text/${entry.id}`}
              className="block px-4 py-3 rounded-lg hover:bg-[var(--card)] transition-colors group"
            >
              <div className="text-sm group-hover:text-[var(--accent)] transition-colors">
                <Highlight text={entry.title} keyword={query} />
              </div>
              <div className="text-xs text-[var(--muted)] mt-0.5 flex gap-3">
                <span>{entry.category}</span>
                {entry.author && <span>{entry.author}</span>}
              </div>
              {entry.preview && (
                <div className="text-xs text-[var(--muted)] mt-1 line-clamp-2 opacity-70">
                  {entry.preview}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* 全文搜索结果：上下文摘要 + 关键词高亮 */}
      {mode === 'full' && full.results.length > 0 && (
        <div className="space-y-1">
          {full.results.map(hit => (
            <Link
              key={hit.entry.id}
              href={`/text/${hit.entry.id}`}
              className="block px-4 py-3 rounded-lg hover:bg-[var(--card)] transition-colors group"
            >
              {/* 高亮使用实际命中词形：简体查询命中繁体语料时两者不同 */}
              <div className="text-sm group-hover:text-[var(--accent)] transition-colors flex items-baseline gap-2">
                <span><Highlight text={hit.entry.title} keyword={hit.matchedTerm} /></span>
                <span className="text-xs text-[var(--muted)]">{hit.matchCount >= 100 ? '100+' : hit.matchCount} 处命中</span>
              </div>
              <div className="text-xs text-[var(--muted)] mt-0.5 flex gap-3">
                <span>{hit.entry.category}</span>
                {hit.entry.author && <span>{hit.entry.author}</span>}
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                <Highlight text={hit.snippet} keyword={hit.matchedTerm} />
              </div>
            </Link>
          ))}
        </div>
      )}

      {query && total === 0 && (
        <p className="text-center text-[var(--muted)] py-12">
          未找到相关{mode === 'full' ? '内容' : '经文'}
          {mode === 'meta' && (
            <>
              ，试试
              <Link href={`?q=${encodeURIComponent(query)}&mode=full`} className="text-[var(--accent)] hover:underline mx-1">
                全文搜索
              </Link>
            </>
          )}
        </p>
      )}

      {!query && (
        <p className="text-center text-[var(--muted)] py-12">请输入搜索关键词</p>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          {page > 1 && (
            <Link href={pageHref(page - 1)}
              className="px-3 py-1.5 text-sm border border-[var(--border)] rounded hover:bg-[var(--card)] transition-colors">
              上一页
            </Link>
          )}
          <span className="px-3 py-1.5 text-sm text-[var(--muted)]">{page} / {totalPages}</span>
          {page < totalPages && (
            <Link href={pageHref(page + 1)}
              className="px-3 py-1.5 text-sm border border-[var(--border)] rounded hover:bg-[var(--card)] transition-colors">
              下一页
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
