import { notFound } from 'next/navigation';
import Link from 'next/link';
import { loadKnowledgeGraph } from '@/lib/graph/load';
import { applyGraphProposals, loadGraphProposals } from '@/lib/graph/proposals';
import {
  listGraphReviewQueue,
  loadGraphOverrides,
  type GraphReviewStatus,
} from '@/lib/graph/overrides';
import type { GraphEdgeSource } from '@/lib/graph/schema';
import ReviewHubNav from '../ReviewHubNav';
import GraphReviewClient from './GraphReviewClient';

/**
 * 图谱低置信度边审核页（仅开发环境）。
 *
 * 工作流：构建期把共现/文献相关标成待考 → 审核者在此确认或否决 →
 * 结果写入 data/graph/overrides.json → 查询层运行时叠加。
 * 不改原文、不重写 graph.json.gz。线上无写入口。
 */

const REVIEW_ENABLED = process.env.NODE_ENV !== 'production' || process.env.DZ_ENABLE_REVIEW === '1';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    status?: string;
    source?: string;
    q?: string;
    page?: string;
  }>;
}

function parseStatus(raw?: string): GraphReviewStatus {
  return raw === 'confirm' || raw === 'reject' ? raw : 'pending';
}

function parseSource(raw?: string): GraphEdgeSource | 'all' {
  return raw === 'cooccur' || raw === 'similar' || raw === 'extract' || raw === 'llm' ? raw : 'all';
}

export default async function GraphReviewPage({ searchParams }: PageProps) {
  if (!REVIEW_ENABLED) notFound();

  const sp = await searchParams;
  const status = parseStatus(sp.status);
  const source = parseSource(sp.source);
  const q = sp.q ?? '';
  const page = Math.max(parseInt(sp.page ?? '1', 10) || 1, 1);

  const rawGraph = loadKnowledgeGraph();
  const graph = rawGraph ? applyGraphProposals(rawGraph, loadGraphProposals()) : null;
  if (!graph) {
    return (
      <div className="animate-fade-in max-w-2xl">
        <ReviewHubNav current="graph" />
        <h1 className="text-2xl font-serif tracking-wider mb-2">图谱审核</h1>
        <p className="text-sm text-[var(--muted)]">图谱产物不存在，请先运行 npm run build-graph。</p>
      </div>
    );
  }

  const queue = listGraphReviewQueue(graph, loadGraphOverrides(), {
    status,
    source,
    q,
    page,
    pageSize: 40,
  });

  const href = (next: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status, source, q, page, ...next };
    if (merged.status && merged.status !== 'pending') p.set('status', String(merged.status));
    if (merged.source && merged.source !== 'all') p.set('source', String(merged.source));
    if (merged.q) p.set('q', String(merged.q));
    if (merged.page && Number(merged.page) > 1) p.set('page', String(merged.page));
    const s = p.toString();
    return s ? `/review/graph?${s}` : '/review/graph';
  };

  const tab = (id: GraphReviewStatus, label: string, count: number) => (
    <Link
      href={href({ status: id, page: 1 })}
      className={`text-sm px-3 py-1.5 rounded-lg border ${
        status === id
          ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--card-hover)]'
          : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
      }`}
    >
      {label} {count}
    </Link>
  );

  const totalPages = Math.max(1, Math.ceil(queue.total / queue.pageSize));

  return (
    <div className="animate-fade-in">
      <ReviewHubNav current="graph" />
      <header className="mb-6">
        <h1 className="text-2xl font-serif tracking-wider mb-2">图谱审核</h1>
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          确认或否决待考关系（共现、文献相关、规则抽取、AI 抽取）。确认后图上改为「人工审定」；否决后该边不再展示。
          校正写入 data/graph/overrides.json，请随代码一并提交。不改原文、不重建图谱产物。
        </p>
      </header>

      <div className="flex flex-wrap gap-2 mb-4">
        {tab('pending', '待审', queue.pending)}
        {tab('confirm', '已确认', queue.confirmed)}
        {tab('reject', '已否决', queue.rejected)}
      </div>

      <form action="/review/graph" method="get" className="flex flex-wrap gap-2 mb-6">
        {status !== 'pending' && <input type="hidden" name="status" value={status} />}
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="按节点名筛选，如 無為、三清…"
          className="flex-1 min-w-[12rem] px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:border-[var(--accent)]"
        />
        <select
          name="source"
          defaultValue={source}
          className="px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm"
        >
          <option value="all">全部来源</option>
          <option value="cooccur">共现推算</option>
          <option value="similar">文献相关</option>
          <option value="extract">规则抽取</option>
          <option value="llm">AI 抽取</option>
        </select>
        <button type="submit" className="px-4 py-2.5 text-sm rounded-lg border border-[var(--accent)] text-[var(--accent)]">
          筛选
        </button>
      </form>

      <p className="text-xs text-[var(--muted)] mb-4">
        本页 {queue.items.length} 条 · 筛选命中 {queue.total} · 第 {queue.page}/{totalPages} 页
      </p>

      <GraphReviewClient items={queue.items} />

      {totalPages > 1 && (
        <nav className="flex justify-between mt-8 text-sm" aria-label="分页">
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} className="text-[var(--accent)] hover:underline">← 上一页</Link>
          ) : <span />}
          {page < totalPages ? (
            <Link href={href({ page: page + 1 })} className="text-[var(--accent)] hover:underline">下一页 →</Link>
          ) : <span />}
        </nav>
      )}
    </div>
  );
}
