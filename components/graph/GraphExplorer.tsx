'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { LOW_CONFIDENCE } from '@/lib/content-schema';
import {
  EDGE_SOURCE_LABELS,
  graphHrefForView,
  GraphNode,
  GraphView,
  NODE_TYPE_LABELS,
  RelatedItem,
} from '@/lib/graph/schema';
import { computeLayout } from '@/lib/graph/layout';
import GraphCanvas from './GraphCanvas';
import RelationList, { hrefForNode } from './RelationList';

/**
 * 图谱探索器：画布 + 选中详情 + 图/列表切换的编排层。
 *
 * 为什么「展开一跳」用页面跳转而不是在画布里原地长节点：
 * 1. 中心点写在 URL 里（/graph?id=…），任何一个局部视图都可分享、可收藏、
 *    可被搜索引擎索引，浏览器前进后退天然就是「回到上一跳」；
 * 2. 原地扩展会引入多中心布局与去重状态，收益却只是省一次导航；
 * 3. 服务端渲染的图与客户端完全一致（布局是纯函数），不会闪。
 *
 * 内容边界：每条关系都展示来源与置信度，低置信度标「待考」；
 * 词表释义标注「词表释义」，不与经文原文混排。
 */
export default function GraphExplorer({
  view,
  variant = 'full',
}: {
  view: GraphView;
  variant?: 'full' | 'compact';
}) {
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [mode, setMode] = useState<'graph' | 'list'>('graph');

  const layout = useMemo(
    () =>
      computeLayout(view, {
        width: variant === 'compact' ? 760 : 900,
        height: variant === 'compact' ? 440 : 620,
        maxNodes: variant === 'compact' ? 22 : 34,
      }),
    [view, variant],
  );

  /** 选中节点对应的那条边：详情面板要展示「凭什么这么连」 */
  const selectedItem: RelatedItem | null = useMemo(() => {
    if (!selected) return null;
    for (const group of view.groups) {
      const hit = group.items.find(i => i.node.id === selected.id);
      if (hit) return hit;
    }
    return null;
  }, [selected, view.groups]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex gap-1 text-xs" role="tablist" aria-label="图谱视图切换">
          {([['graph', '关系图'], ['list', '关系列表']] as const).map(([m, label]) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-full border transition-colors cursor-pointer ${
                mode === m
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {variant === 'compact' && (
          <Link href={graphHrefForView(view)} className="text-xs text-[var(--accent)] hover:underline">
            展开完整图谱 →
          </Link>
        )}
      </div>

      {mode === 'graph' ? (
        <div className="grid md:grid-cols-[1fr_260px] gap-4 items-start">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/60 overflow-hidden">
            <GraphCanvas layout={layout} selectedId={selected?.id ?? null} onSelect={setSelected} />
          </div>

          <aside className="text-sm md:sticky md:top-4">
            {selected && selectedItem ? (
              <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
                <div className="flex items-baseline gap-2 flex-wrap mb-2">
                  <h3 className="font-serif text-base">{selected.label}</h3>
                  <span className="text-[10px] text-[var(--muted)] px-1.5 py-0.5 border border-[var(--border)] rounded">
                    {NODE_TYPE_LABELS[selected.type]}
                  </span>
                </div>

                <p className="text-xs text-[var(--muted)] mb-2">
                  与「{view.center.label}」的关系：{relationOf(view, selected.id)}
                  <br />
                  来源：{EDGE_SOURCE_LABELS[selectedItem.edge.source]}
                  {selectedItem.edge.confidence < LOW_CONFIDENCE && (
                    <span className="text-[var(--cinnabar)]">（置信度偏低，待考）</span>
                  )}
                </p>

                {selected.shortDef && (
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-2">
                    {selected.shortDef}
                    <span className="ml-1 text-[10px] text-[var(--muted)]">（词表释义，非典籍原文）</span>
                  </p>
                )}

                {selectedItem.edge.citations?.map((c, i) => (
                  <p key={i} className="text-xs font-serif text-[var(--text-secondary)] leading-relaxed mb-1.5">
                    「{c.quote}」
                    <Link
                      href={c.blockId ? `/text/${c.bookId}#${c.blockId}` : `/text/${c.bookId}`}
                      className="ml-1 text-[var(--accent)] hover:underline whitespace-nowrap"
                    >
                      见原文
                    </Link>
                  </p>
                ))}

                {selected.works != null && (
                  <p className="text-xs text-[var(--muted)] mb-2">全库 {selected.works} 部典籍提及</p>
                )}

                <div className="flex flex-wrap gap-2 mt-3">
                  <Link
                    href={`/graph?id=${encodeURIComponent(selected.id)}`}
                    className="px-3 py-1.5 text-xs rounded-full bg-[var(--accent)] text-white hover:bg-[var(--accent-light)] transition-colors"
                  >
                    以此为中心
                  </Link>
                  <Link
                    href={hrefForNode(selectedItem)}
                    className="px-3 py-1.5 text-xs rounded-full border border-[var(--border)] hover:border-[var(--accent-light)] transition-colors"
                  >
                    {selected.type === 'work' ? '阅读此书' : '查看详情'}
                  </Link>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-xs text-[var(--muted)] leading-relaxed">
                <p className="mb-2">点击图上任一节点查看关系依据与出处，再选「以此为中心」即可继续向外走一跳。</p>
                <p className="mb-2">实线为目录与原文提及等较强关系；虚线为共现、相关度等统计推算，仅供探索参考。</p>
                {view.note && <p className="text-[var(--text-secondary)]">{view.note}</p>}
              </div>
            )}
          </aside>
        </div>
      ) : (
        <RelationList view={view} />
      )}
    </div>
  );
}

/** 从视图里回查某节点所属的关系分组标题（详情面板用语） */
function relationOf(view: GraphView, nodeId: string): string {
  for (const group of view.groups) {
    if (group.items.some(i => i.node.id === nodeId)) return group.label;
  }
  return '关联';
}
