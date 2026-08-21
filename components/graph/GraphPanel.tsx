'use client';

import { useState } from 'react';
import Link from 'next/link';
import { graphHrefForView, GraphView, NODE_ORIGIN_LABELS, NODE_TYPE_LABELS } from '@/lib/graph/schema';
import GraphExplorer from './GraphExplorer';

/**
 * 关联图谱面板：嵌在搜索页结果之上的入口。
 *
 * 展开策略：检索词命中图谱实体时默认展开 —— 用户搜「符箓」想要的正是
 * 「除了匹配结果，还有哪些关联本体与文献」，这时把它藏在一次点击后面
 * 等于把主菜端上来又盖上盖子（实测中确有人找不到入口）。
 * 反之走关键词回退链路时（synthetic）关系较弱，默认折叠，
 * 只用一行摘要预告，避免噪声挤占结果首屏。
 */
export default function GraphPanel({ view }: { view: GraphView }) {
  const [open, setOpen] = useState(!view.synthetic);

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
            {view.center.origin === 'auto' && (
              <span className="text-[10px] text-[var(--cinnabar)] px-1.5 py-0.5 border border-[var(--border)] rounded">
                {NODE_ORIGIN_LABELS.auto}
              </span>
            )}
          </span>
          {preview.length > 0 && (
            <span className="block text-xs text-[var(--muted)] mt-1 leading-relaxed line-clamp-2">
              {preview.join(' · ')}
            </span>
          )}
        </span>
        <span className="text-xs text-[var(--accent)] shrink-0 pt-1">{open ? '收起关系图' : '展开关系图'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {view.center.shortDef && (
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3">
              {view.center.shortDef}
              {!view.synthetic && view.center.origin !== 'auto' && (
                <span className="ml-1 text-[10px] text-[var(--muted)]">（词表释义，非典籍原文）</span>
              )}
            </p>
          )}
          {view.center.origin === 'auto' && (
            <p className="text-xs text-[var(--muted)] leading-relaxed mb-3">
              由语料统计自动识别，无词表释义。
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
