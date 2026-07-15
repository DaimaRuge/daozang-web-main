import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getEntryById, getContentById, searchEntries } from '@/lib/data';
import { parseText } from '@/lib/text-parser';
import { loadOverrides, overrideKey } from '@/lib/parser-overrides';
import { LOW_CONFIDENCE } from '@/lib/content-schema';
import ReviewClient, { ReviewItem } from './ReviewClient';

/**
 * 低置信度块人工审核页（仅开发环境，服务端组件）。
 *
 * 工作流：解析报告（docs/parse-report.md）指出问题最多的典籍 →
 * 审核者在此逐块确认/改判 → 结果写入 data/parser-overrides.json →
 * 阅读页解析时自动叠加。校正数据随代码提交，线上无写入口。
 */

const REVIEW_ENABLED = process.env.NODE_ENV !== 'production' || process.env.DZ_ENABLE_REVIEW === '1';

// 审核页读取 data/ 下的 overrides 文件并依赖查询参数，禁止静态化
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ book?: string; q?: string }>;
}

export default async function ReviewPage({ searchParams }: PageProps) {
  if (!REVIEW_ENABLED) notFound();

  const { book, q } = await searchParams;
  const overrides = loadOverrides();

  // ---- 单书审核视图 ----
  if (book) {
    const entry = getEntryById(book);
    if (!entry) notFound();

    const parsed = parseText(getContentById(book), book, entry.title);
    const bookOverrides = overrides[book] ?? {};

    // 审核对象：低置信度块 + 已有人工校正的块（可复查/撤销）
    const items: ReviewItem[] = [];
    parsed.blocks.forEach((b, i) => {
      const key = overrideKey(b);
      const applied = bookOverrides[key];
      if (b.confidence >= LOW_CONFIDENCE && !applied) return;
      items.push({
        key,
        blockId: b.id,
        content: b.content,
        ruleType: b.type,
        ruleLevel: b.level,
        confidence: b.confidence,
        override: applied ? { type: applied.type, level: applied.level } : null,
        // 前后块内容各截 30 字：人工判断需要语境
        prevContent: parsed.blocks[i - 1]?.content.slice(0, 30) ?? '',
        nextContent: parsed.blocks[i + 1]?.content.slice(0, 30) ?? '',
      });
    });

    return (
      <div className="animate-fade-in">
        <ReviewHeader />
        <div className="mb-6 pb-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-serif tracking-wide">{entry.title}</h2>
          <p className="text-xs text-[var(--muted)] mt-1">
            共 {parsed.stats.totalBlocks} 块 · 待审核 {items.filter(it => !it.override).length} · 已校正 {Object.keys(bookOverrides).length}
            <Link href={`/text/${book}`} className="ml-3 text-[var(--accent)] hover:underline">查看阅读页 →</Link>
          </p>
        </div>
        <ReviewClient bookId={book} items={items} />
      </div>
    );
  }

  // ---- 选书视图：检索 + 已有校正记录列表 ----
  const results = q ? searchEntries(q, 1, 20).results : [];
  const reviewedBooks = Object.entries(overrides)
    .map(([id, map]) => ({ entry: getEntryById(id), count: Object.keys(map).length }))
    .filter(b => b.entry);

  return (
    <div className="animate-fade-in max-w-2xl">
      <ReviewHeader />

      <form action="/review" method="get" className="mb-8">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ''}
          placeholder="搜索典籍名，选择要审核的书…"
          className="w-full px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:border-[var(--accent)]"
        />
      </form>

      {q && (
        <section className="mb-10">
          <h2 className="text-sm text-[var(--muted)] mb-3">检索结果</h2>
          {results.length === 0 && <p className="text-sm text-[var(--muted)]">未找到匹配的典籍。</p>}
          <ul className="space-y-1">
            {results.map(e => (
              <li key={e.id}>
                <Link href={`/review?book=${encodeURIComponent(e.id)}`} className="text-sm text-[var(--accent)] hover:underline">
                  {e.title}
                </Link>
                <span className="text-xs text-[var(--muted)] ml-2">{e.category}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reviewedBooks.length > 0 && (
        <section>
          <h2 className="text-sm text-[var(--muted)] mb-3">已有人工校正的典籍</h2>
          <ul className="space-y-1">
            {reviewedBooks.map(({ entry, count }) => (
              <li key={entry!.id}>
                <Link href={`/review?book=${encodeURIComponent(entry!.id)}`} className="text-sm text-[var(--accent)] hover:underline">
                  {entry!.title}
                </Link>
                <span className="text-xs text-[var(--muted)] ml-2">{count} 条校正</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-[var(--muted)] mt-10 leading-relaxed">
        提示：优先审核 docs/parse-report.md 中「低置信度占比最高」的典籍。
        校正结果写入 data/parser-overrides.json，请随代码一并提交。
      </p>
    </div>
  );
}

function ReviewHeader() {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-serif tracking-wider mb-2">解析审核</h1>
      <p className="text-xs text-[var(--muted)]">
        人工确认或改判解析器无法确定的内容块（开发环境工具，不对外）。
      </p>
    </header>
  );
}
