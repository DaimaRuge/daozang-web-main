import Link from 'next/link';
import { kindLabel } from '@/lib/illustrations/kinds';
import { loadIllustrationCatalog } from '@/lib/illustrations/catalog';
import {
  candidateToQueueItem,
  countImportedCandidates,
  filterCandidateQueue,
  listIllustrationCandidatesFromDb,
  type CandidateQueueItem,
  type QueueFilters,
} from '@/lib/illustrations/persist';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 40;

interface PageProps {
  searchParams: Promise<{ kind?: string; signal?: string; q?: string; page?: string }>;
}

export default async function StudioIllustrationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filters: QueueFilters = {
    kind: sp.kind || undefined,
    signal: sp.signal || undefined,
    q: sp.q || undefined,
  };
  const page = Math.max(1, Number(sp.page) || 1);

  const { items, source, dbCount } = await loadQueue(filters);
  const total = items.length;
  const slice = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { kind: sp.kind, signal: sp.signal, q: sp.q, ...next };
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
          缺图候选
        </p>
        <h1 className="text-2xl font-serif tracking-wider mt-1">缺图候选</h1>
        <p className="text-sm text-[var(--muted)] mt-2">
          自动扫描结果，供后期配图锚定。本页只读；不改原文，也不写入正式阅读页。
        </p>
      </header>

      <div className="flex flex-wrap gap-3 text-sm">
        <span className="border border-[var(--border)] rounded-lg px-3 py-2 bg-[var(--card)]">
          清单 {total}
        </span>
        <span className="border border-[var(--border)] rounded-lg px-3 py-2 bg-[var(--card)]">
          来源 {source === 'db' ? `Postgres${dbCount != null ? ` · 表内 ${dbCount}` : ''}` : '扫描 JSON'}
        </span>
      </div>

      <form className="flex flex-wrap gap-2 items-end" method="get">
        <label className="text-xs text-[var(--muted)]">
          类型
          <select name="kind" defaultValue={sp.kind ?? ''} className="block mt-1 border border-[var(--border)] rounded px-2 py-1 bg-[var(--card)]">
            <option value="">全部</option>
            <option value="seal">印章</option>
            <option value="talisman">符箓</option>
            <option value="palm">掌诀</option>
            <option value="plate">图版</option>
          </select>
        </label>
        <label className="text-xs text-[var(--muted)]">
          线索
          <select name="signal" defaultValue={sp.signal ?? ''} className="block mt-1 border border-[var(--border)] rounded px-2 py-1 bg-[var(--card)]">
            <option value="">全部</option>
            <option value="heading-slot">章题槽</option>
            <option value="inline-ref">正文线索</option>
            <option value="title-tu">书名含圖</option>
          </select>
        </label>
        <label className="text-xs text-[var(--muted)] flex-1 min-w-[12rem]">
          搜索
          <input
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder="书名、章题、线索"
            className="block mt-1 w-full border border-[var(--border)] rounded px-2 py-1 bg-[var(--card)]"
          />
        </label>
        <button type="submit" className="px-3 py-1.5 rounded border border-[var(--accent)] text-[var(--accent)] text-sm">
          筛选
        </button>
      </form>

      <div className="overflow-x-auto border border-[var(--border)] rounded-lg">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--muted)] border-b border-[var(--border)]">
            <tr>
              <th className="px-3 py-2 font-normal">类型</th>
              <th className="px-3 py-2 font-normal">占位</th>
              <th className="px-3 py-2 font-normal">书目</th>
              <th className="px-3 py-2 font-normal">线索</th>
              <th className="px-3 py-2 font-normal">置信</th>
              <th className="px-3 py-2 font-normal">打开</th>
            </tr>
          </thead>
          <tbody>
            {slice.map(item => (
              <QueueRow key={item.id} item={item} />
            ))}
            {slice.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[var(--muted)]">
                  没有匹配的候选。若表为空，先 <code>npm run scan:illustrations</code>
                  {source !== 'db' ? '；有库后再 npm run migrate && npm run import:illustrations' : ''}。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <p className="text-xs text-[var(--muted)] flex gap-3">
          {page > 1 && (
            <Link href={`/studio/illustrations${qs({ page: String(page - 1) })}`} className="text-[var(--accent)]">
              上一页
            </Link>
          )}
          <span>
            {page} / {pages}
          </span>
          {page < pages && (
            <Link href={`/studio/illustrations${qs({ page: String(page + 1) })}`} className="text-[var(--accent)]">
              下一页
            </Link>
          )}
        </p>
      )}
    </div>
  );
}

function QueueRow({ item }: { item: CandidateQueueItem }) {
  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="px-3 py-2 whitespace-nowrap text-[var(--accent)]">〔{kindLabel(item.kind)}〕</td>
      <td className="px-3 py-2">{item.slotLabel}</td>
      <td className="px-3 py-2 text-[var(--muted)]">
        {item.title}
        {item.category ? ` · ${item.category}` : ''}
      </td>
      <td className="px-3 py-2 text-[var(--muted)]">{item.clue}</td>
      <td className="px-3 py-2">{Math.round(item.confidence * 100)}%</td>
      <td className="px-3 py-2 whitespace-nowrap space-x-2">
        <Link href={item.demoHref} className="text-[var(--accent)] hover:underline">
          排版
        </Link>
        <Link href={item.readerHref} className="text-[var(--muted)] hover:text-[var(--accent)]">
          阅读
        </Link>
      </td>
    </tr>
  );
}

async function loadQueue(filters: QueueFilters): Promise<{
  items: CandidateQueueItem[];
  source: 'db' | 'json';
  dbCount?: number;
}> {
  if (process.env.DATABASE_URL) {
    try {
      const dbCount = await countImportedCandidates();
      if (dbCount > 0) {
        const rows = await listIllustrationCandidatesFromDb(filters);
        return { items: rows.map(candidateToQueueItem), source: 'db', dbCount };
      }
    } catch {
      // 本地没开库时回退 JSON，避免审核台整页报错
    }
  }
  const catalog = loadIllustrationCatalog();
  const filtered = filterCandidateQueue(catalog.candidates, filters);
  filtered.sort((a, b) => b.confidence - a.confidence || a.title.localeCompare(b.title, 'zh'));
  return { items: filtered.map(candidateToQueueItem), source: 'json' };
}
