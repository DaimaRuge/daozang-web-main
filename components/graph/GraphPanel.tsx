'use client';

import { useState } from 'react';
import Link from 'next/link';
import { graphHrefForView, GraphView, NODE_TYPE_LABELS } from '@/lib/graph/schema';
import GraphExplorer from './GraphExplorer';

/**
 * 关联图谱折叠面板：嵌在搜索页结果之上的入口。
 *
 * 为什么默认折叠：搜索页的主任务是看命中结果，图谱是「顺手多看一眼关系」的
 * 增强，不应挤占结果列表的首屏（项目交互原则是克制、非打扰式）。
 * 折叠时用一行关系摘要预告图里有什么，用户才有理由展开。
 */
export default function GraphPanel({ view }: { view: GraphView }) {
  const [open, setOpen] = useState(false);

  // 折叠态摘要：取前几组关系里最靠前的邻居，让用户预知展开后能看到什么
  const preview = view.groups
    .flatMap(g => g.items.slice(0, 3).map(i => i.node.label))
    .filter((label, i, arr) => arr.indexOf(label) === i)
    .slice(0, 8);

  return (
    <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card)]/50">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-start gap-3 p-4 text-left cursor-pointer"
      >
        <span
          className="w-9 h-9 shrink-0 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center text-sm font-serif"
          aria-hidden
        >
          關
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-medium">
              「{view.center.label}」的关联{view.synthetic ? '（由命中典籍反向汇总）' : ''}
            </span>
            <span className="text-[10px] text-[var(--muted)] px-1.5 py-0.5 border border-[var(--border)] rounded">
              {NODE_TYPE_LABELS[view.center.type]}
            </span>
          </span>
          {preview.length > 0 && (
            <span className="block text-xs text-[var(--muted)] mt-1 leading-relaxed line-clamp-2">
              {preview.join(' · ')}
            </span>
          )}
        </span>
        <span className="text-xs text-[var(--accent)] shrink-0 pt-1">{open ? '收起' : '展开关系图'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {view.center.shortDef && (
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3">
              {view.center.shortDef}
              {!view.synthetic && <span className="ml-1 text-[10px] text-[var(--muted)]">（词表释义，非典籍原文）</span>}
            </p>
          )}
          <GraphExplorer view={view} variant="compact" />
        </div>
      )}

      {!open && (
        <div className="px-4 pb-3 -mt-1">
          <Link
            href={graphHrefForView(view)}
            className="text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
          >
            或直接前往图谱页 →
          </Link>
        </div>
      )}
    </section>
  );
}
