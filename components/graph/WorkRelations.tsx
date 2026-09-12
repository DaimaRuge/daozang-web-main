import Link from 'next/link';
import { graphForWork, isGraphAvailable } from '@/lib/graph/query';
import { graphHrefForView } from '@/lib/graph/schema';

/**
 * 阅读页页脚的「本书关联」区块（服务端组件）。
 *
 * 为什么不做进 Reader：Reader 是客户端编排组件，只该管状态与持久化；
 * 关联数据是服务端只读产物，放在页面层直接渲染即可，
 * 既不给阅读器增加职责，也让这些关联链接对搜索引擎可见。
 *
 * 为什么只放两组：读者读到篇末时想的是「接下来读什么」，
 * 给出同域文献与本书涉及的本体两条线足矣，完整关系图在 /graph 里看。
 */
export default function WorkRelations({ bookId, title }: { bookId: string; title: string }) {
  if (!isGraphAvailable()) return null;

  const view = graphForWork(bookId, 6);
  if (!view) return null;

  const similar = view.groups.find(g => g.type === 'similar_work');
  // 本体是「实体 → 本书」的入边，方向为 in
  const concepts = view.groups.find(g => g.type === 'mentioned_in' && g.items[0]?.direction === 'in');

  if (!similar && !concepts) return null;

  return (
    <section className="max-w-2xl mx-auto px-6 pb-12 -mt-4">
      <div className="pt-6 border-t border-[var(--border)]">
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <h2 className="text-sm text-[var(--muted)] tracking-wider">本书关联</h2>
          <Link href={graphHrefForView(view)} className="text-xs text-[var(--accent)] hover:underline">
            在图谱中展开 →
          </Link>
        </div>

        {concepts && concepts.items.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-[var(--muted)] mb-2">本书涉及</p>
            <div className="flex flex-wrap gap-2">
              {concepts.items.map(item => (
                <Link
                  key={item.node.id}
                  href={`/graph?id=${encodeURIComponent(item.node.id)}`}
                  className="px-3 py-1 text-xs font-serif bg-[var(--card)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent-light)] transition-colors"
                >
                  {item.node.label}
                  {item.edge.weight != null && (
                    <span className="ml-1 text-[10px] text-[var(--muted)]">{item.edge.weight}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {similar && similar.items.length > 0 && (
          <div>
            <p className="text-xs text-[var(--muted)] mb-2">
              主题相近的典籍
              <span className="ml-1 text-[10px]">（按共享概念计算，供探索参考）</span>
            </p>
            <ul className="grid sm:grid-cols-2 gap-1.5">
              {similar.items.map(item => (
                <li key={item.node.id}>
                  <Link
                    href={`/text/${item.node.id.slice('work:'.length)}`}
                    className="block px-3 py-2 text-sm font-serif rounded-lg border border-transparent hover:border-[var(--border)] hover:bg-[var(--card)] transition-colors"
                  >
                    {item.node.label}
                    {item.node.meta?.category && (
                      <span className="ml-2 text-[10px] text-[var(--muted)]">{item.node.meta.category}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 text-[10px] text-[var(--muted)]">
          关联由目录结构与原文关键词扫描计算得出，非文献学结论；《{title}》原文未作任何改动。
        </p>
      </div>
    </section>
  );
}
