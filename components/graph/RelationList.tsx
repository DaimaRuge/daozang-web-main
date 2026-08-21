import Link from 'next/link';
import { LOW_CONFIDENCE } from '@/lib/content-schema';
import {
  EDGE_SOURCE_LABELS,
  GraphView,
  NODE_ORIGIN_LABELS,
  NODE_TYPE_LABELS,
  RelatedItem,
} from '@/lib/graph/schema';

/**
 * 关系列表：图谱的等价文本视图。
 *
 * 为什么必须有这一份：
 * 1. 无障碍与无 JS 环境下，SVG 图不可用，但关系信息不能因此丢失；
 * 2. 出处（Citation）在图上只能放一两条，列表里可以完整展示并直接点回原文；
 * 3. 服务端组件即可渲染，搜索引擎能索引到「符箓 — 见于某某经」这类关系。
 *
 * 内容边界：每条关系都标出来源（目录/词表/原文提及/统计推算）与「待考」标记，
 * 不把统计推算包装成确定结论。
 */

/** 节点链接目标：典籍进阅读器，其余进图谱页继续展开 */
export function hrefForNode(item: RelatedItem): string {
  const { node, edge } = item;
  if (node.type === 'work') {
    const bookId = node.id.slice('work:'.length);
    const blockId = edge.citations?.[0]?.blockId;
    // 阅读器支持 #blockId 深链（分页模式下会先翻到对应页再闪烁提示），
    // 所以提及类关系可以直接落到出现该词的那一段，而不是丢用户在书首
    return blockId ? `/text/${bookId}#${blockId}` : `/text/${bookId}`;
  }
  return `/graph?id=${encodeURIComponent(node.id)}`;
}

export default function RelationList({ view }: { view: GraphView }) {
  return (
    <div className="space-y-6">
      {view.groups.map(group => (
        <section key={`${group.type}-${group.label}`}>
          <h3 className="text-xs font-sans text-[var(--muted)] mb-2 flex items-baseline gap-2">
            <span>{group.label}</span>
            <span className="text-[10px]">
              {group.items.length < group.total ? `显示 ${group.items.length} / ${group.total}` : group.total}
            </span>
          </h3>

          <ul className="space-y-1">
            {group.items.map(item => {
              const weak = item.edge.confidence < LOW_CONFIDENCE;
              const citation = item.edge.citations?.[0];
              return (
                <li key={`${item.node.id}-${item.edge.type}`}>
                  <Link
                    href={hrefForNode(item)}
                    className="block px-3 py-2 rounded-lg border border-transparent hover:border-[var(--border)] hover:bg-[var(--card)] transition-colors group"
                  >
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-serif group-hover:text-[var(--accent)] transition-colors">
                        {item.node.label}
                      </span>
                      <span className="text-[10px] text-[var(--muted)] px-1.5 py-0.5 border border-[var(--border)] rounded">
                        {NODE_TYPE_LABELS[item.node.type]}
                      </span>
                      {item.node.origin === 'auto' && (
                        <span className="text-[10px] text-[var(--cinnabar)] px-1.5 py-0.5 border border-[var(--border)] rounded">
                          {NODE_ORIGIN_LABELS.auto}
                        </span>
                      )}
                      {item.edge.weight != null && item.edge.type === 'mentioned_in' && (
                        <span className="text-[10px] text-[var(--muted)]">{item.edge.weight} 处</span>
                      )}
                      {item.edge.weight != null && item.edge.type === 'cooccurs_with' && (
                        <span className="text-[10px] text-[var(--muted)]">同见于 {item.edge.weight} 部</span>
                      )}
                      <span className="text-[10px] text-[var(--muted)] ml-auto">
                        {EDGE_SOURCE_LABELS[item.edge.source]}
                      </span>
                      {weak && (
                        <span className="text-[10px] text-[var(--cinnabar)] px-1.5 py-0.5 border border-[var(--cinnabar)] rounded">
                          待考
                        </span>
                      )}
                    </div>

                    {citation?.quote && (
                      <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed font-serif">
                        「{citation.quote}」
                      </p>
                    )}
                    {item.node.shortDef && !citation?.quote && (
                      <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">
                        {item.node.shortDef}
                        {item.node.origin !== 'auto' && item.node.origin !== 'query' && (
                          <span className="ml-1 text-[10px]">（词表释义）</span>
                        )}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
