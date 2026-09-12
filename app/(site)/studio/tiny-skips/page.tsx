import Link from 'next/link';
import { daozangImageUrl } from '@/lib/daozang-image-url';
import {
  filterTinySkips,
  loadTinySkipCatalog,
  tinySkipBookOptions,
  tinySkipDisplaySize,
  tinySkipPartOptions,
  tinySkipShape,
  type TinySkipFilters,
  type TinySkipItem,
  type TinySkipShape,
} from '@/lib/daozang-tiny-skips';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 48;

const SHAPE_LABEL: Record<TinySkipShape, string> = {
  'strip-v': '竖条',
  'strip-h': '横条',
  stamp: '小印',
};

interface PageProps {
  searchParams: Promise<{ q?: string; bookId?: string; part?: string; shape?: string; page?: string }>;
}

function parseShape(value?: string): TinySkipShape | undefined {
  if (value === 'strip-v' || value === 'strip-h' || value === 'stamp') return value;
  return undefined;
}

export default async function StudioTinySkipsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filters: TinySkipFilters = {
    q: sp.q || undefined,
    bookId: sp.bookId || undefined,
    part: sp.part || undefined,
    shape: parseShape(sp.shape),
  };
  const page = Math.max(1, Number(sp.page) || 1);
  const catalog = loadTinySkipCatalog();
  const items = catalog?.items ?? [];
  const filtered = filterTinySkips(items, filters);
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const books = tinySkipBookOptions(items);
  const partSource = filters.bookId ? items.filter(i => i.bookId === filters.bookId) : items;
  const parts = tinySkipPartOptions(partSource);
  const shapeCounts = {
    'strip-v': items.filter(i => tinySkipShape(i) === 'strip-v').length,
    'strip-h': items.filter(i => tinySkipShape(i) === 'strip-h').length,
    stamp: items.filter(i => tinySkipShape(i) === 'stamp').length,
  };

  const qs = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: sp.q, bookId: sp.bookId, part: sp.part, shape: sp.shape, ...next };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <p className="text-xs text-[var(--muted)]">
          <Link href="/studio" className="hover:text-[var(--accent)]">
            运营后台
          </Link>
          <span className="mx-2">/</span>
          细条跳过
        </p>
        <h1 className="text-2xl font-serif tracking-wider mt-1">细条跳过</h1>
        <p className="text-sm text-[var(--muted)] mt-2">
          最短边不足 24 像素的原扫描，复原管线跳过，不生成墨线/朱砂。本页只读，放大原图便于核对，不改原文、不覆盖文件。
        </p>
      </header>

      {!catalog ? (
        <p className="text-sm text-[var(--muted)]">
          还没有清单。在仓库根目录运行 <code>npm run list:tiny-skips</code> 生成{' '}
          <code>data/daozang-tiny-skips.json</code>。
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="border border-[var(--border)] rounded-lg px-3 py-2 bg-[var(--card)]">
              细条 {catalog.stats.tiny}
            </span>
            <span className="border border-[var(--border)] rounded-lg px-3 py-2 bg-[var(--card)]">
              书目 {catalog.stats.books}
            </span>
            <span className="border border-[var(--border)] rounded-lg px-3 py-2 bg-[var(--card)]">
              本筛选 {total}
            </span>
            <span className="text-xs text-[var(--muted)] self-center">
              竖条 {shapeCounts['strip-v']} · 横条 {shapeCounts['strip-h']} · 小印 {shapeCounts.stamp}
              {catalog.generatedAt ? ` · 生成于 ${catalog.generatedAt.slice(0, 10)}` : ''}
            </span>
          </div>

          <form className="flex flex-wrap gap-2 items-end" method="get">
            <label className="text-xs text-[var(--muted)]">
              书目
              <select
                name="bookId"
                defaultValue={sp.bookId ?? ''}
                className="block mt-1 border border-[var(--border)] rounded px-2 py-1 bg-[var(--card)] max-w-[18rem]"
              >
                <option value="">全部</option>
                {books.map(b => (
                  <option key={b.bookId} value={b.bookId}>
                    {b.title}（{b.count}）
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[var(--muted)]">
              部
              <select
                name="part"
                defaultValue={sp.part ?? ''}
                className="block mt-1 border border-[var(--border)] rounded px-2 py-1 bg-[var(--card)] max-w-[12rem]"
              >
                <option value="">全部</option>
                {parts.map(p => (
                  <option key={p.part} value={p.part}>
                    {p.part}（{p.count}）
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[var(--muted)]">
              形状
              <select
                name="shape"
                defaultValue={sp.shape ?? ''}
                className="block mt-1 border border-[var(--border)] rounded px-2 py-1 bg-[var(--card)]"
              >
                <option value="">全部</option>
                <option value="strip-v">竖条</option>
                <option value="strip-h">横条</option>
                <option value="stamp">小印</option>
              </select>
            </label>
            <label className="text-xs text-[var(--muted)] flex-1 min-w-[12rem]">
              搜索
              <input
                name="q"
                defaultValue={sp.q ?? ''}
                placeholder="书名、文件名、部"
                className="block mt-1 w-full border border-[var(--border)] rounded px-2 py-1 bg-[var(--card)]"
              />
            </label>
            <button type="submit" className="px-3 py-1.5 rounded border border-[var(--accent)] text-[var(--accent)] text-sm">
              筛选
            </button>
          </form>

          {slice.length === 0 ? (
            <p className="text-sm text-[var(--muted)] py-8 text-center">没有匹配的细条。</p>
          ) : (
            <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {slice.map(item => (
                <TinySkipCard key={`${item.bookId}:${item.part}:${item.file}`} item={item} />
              ))}
            </ul>
          )}

          {pages > 1 && (
            <p className="text-xs text-[var(--muted)] flex gap-3">
              {safePage > 1 && (
                <Link href={`/studio/tiny-skips${qs({ page: String(safePage - 1) })}`} className="text-[var(--accent)]">
                  上一页
                </Link>
              )}
              <span>
                {safePage} / {pages}
              </span>
              {safePage < pages && (
                <Link href={`/studio/tiny-skips${qs({ page: String(safePage + 1) })}`} className="text-[var(--accent)]">
                  下一页
                </Link>
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function TinySkipCard({ item }: { item: TinySkipItem }) {
  const display = tinySkipDisplaySize(item);
  const src = daozangImageUrl(item.part, item.file);
  const shape = tinySkipShape(item);
  return (
    <li className="border border-[var(--border)] rounded-lg bg-[var(--card)] p-3 space-y-2">
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-[8rem] items-center justify-center rounded bg-[var(--bg)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`${item.title} ${item.file}`}
          width={display.width}
          height={display.height}
          className="max-w-full max-h-36"
          style={{ imageRendering: 'pixelated' }}
        />
      </a>
      <p className="text-xs flex flex-wrap gap-x-2 gap-y-1">
        <span className="text-[var(--accent)]">{item.width}×{item.height}</span>
        <span className="text-[var(--muted)]">{SHAPE_LABEL[shape]}</span>
      </p>
      <p className="text-sm font-serif leading-snug line-clamp-2">{item.title}</p>
      <p className="text-[11px] text-[var(--muted)] font-mono break-all">{item.part}/{item.file}</p>
      <p className="text-xs space-x-3">
        <Link href={`/text/${item.bookId}`} className="text-[var(--accent)] hover:underline">
          阅读
        </Link>
        <a href={src} target="_blank" rel="noreferrer" className="text-[var(--muted)] hover:text-[var(--accent)]">
          原图
        </a>
      </p>
    </li>
  );
}
