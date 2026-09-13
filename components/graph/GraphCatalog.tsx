import Link from 'next/link';
import {
  ATLAS_AUTO_LIMIT,
  ATLAS_FILTER_LIMIT,
  GraphAtlasEntry,
  GraphAtlasSection,
  GraphAtlasTypeSummary,
} from '@/lib/graph/query';
import { NODE_ORIGIN_LABELS } from '@/lib/graph/schema';

/**
 * /graph 无检索时的概念图目录（服务端组件）。
 *
 * 词表扩到 1000+ 之后，只放 12 个种子入口等于把自动术语藏起来。
 * 目录按类型开架：策展词带释义，自动术语只给提及最多的一批，
 * 其余走页面上方的检索框。不在这里渲染关系图。
 */

export function GraphAtlasTiles({
  items,
  stats,
}: {
  items: GraphAtlasTypeSummary[];
  stats: { nodes: number; edges: number; works: number; scannedChars: number; autoEntities?: number } | null;
}) {
  return (
    <section>
      <h2 className="text-sm text-[var(--muted)] tracking-wider mb-3">按类型浏览</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        {items.map(item => (
          <Link
            key={item.type}
            href={`/graph?type=${item.type}`}
            className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent-light)] transition-colors"
          >
            <p className="font-serif text-base mb-1">{item.label}</p>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              {item.curated} 条策展
              {item.auto > 0 ? ` · ${item.auto} 条自动抽取` : ''}
            </p>
          </Link>
        ))}
      </div>
      {stats && (
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          当前图谱含 {stats.nodes.toLocaleString('zh-CN')} 个节点、
          {stats.edges.toLocaleString('zh-CN')} 条关系，
          由 {stats.works.toLocaleString('zh-CN')} 部典籍、约
          {(stats.scannedChars / 1e6).toFixed(1)} 百万字原文扫描而成。
          词表来自人工策展
          {stats.autoEntities ? `与自动抽取（${stats.autoEntities.toLocaleString('zh-CN')} 条）` : ''}
          ；关系分为目录事实、词表策展、构词推断、原文提及与统计推算，界面上均如实标注。
        </p>
      )}
    </section>
  );
}

export function GraphAtlasSectionView({ section }: { section: GraphAtlasSection }) {
  const cap = section.filter ? ATLAS_FILTER_LIMIT : ATLAS_AUTO_LIMIT;
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <h2 className="text-lg font-serif">{section.label}</h2>
        <Link href="/graph" className="text-xs text-[var(--accent)] hover:underline">
          返回类型目录
        </Link>
      </div>
      <form action="/graph" method="get" className="mb-4 max-w-xl">
        <input type="hidden" name="type" value={section.type} />
        <div className="relative">
          <input
            type="text"
            name="filter"
            defaultValue={section.filter ?? ''}
            placeholder="筛选本类，简体繁体均可，如「玉皇」"
            className="w-full pl-5 pr-24 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-full text-sm font-serif focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-1 text-sm rounded-full bg-[var(--accent)] text-white hover:bg-[var(--accent-light)] transition-colors cursor-pointer"
          >
            筛选
          </button>
        </div>
      </form>
      <p className="text-xs text-[var(--muted)] mb-4">
        {section.filter
          ? `「${section.filter}」命中 ${section.curated.length} 条策展、${section.autoTotal} 条自动抽取`
          : `${section.curated.length} 条词表策展${
              section.autoTotal > 0
                ? ` · ${section.autoTotal} 条自动抽取（按提及典籍数列出前 ${Math.min(cap, section.autoTotal)}）`
                : ''
            }`}
        {section.filter && (
          <Link href={`/graph?type=${section.type}`} className="ml-2 text-[var(--accent)] hover:underline">
            清除筛选
          </Link>
        )}
      </p>
      {section.curated.length === 0 && section.auto.length === 0 && (
        <p className="text-sm text-[var(--muted)] mb-6">
          本类没有与「{section.filter}」匹配的词条。可改用上方「展开」在全图检索。
        </p>
      )}

      {section.curated.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
          {section.curated.map(entry => (
            <AtlasCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {section.auto.length > 0 && (
        <div>
          <h3 className="text-sm text-[var(--muted)] tracking-wider mb-3">
            {NODE_ORIGIN_LABELS.auto}
          </h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {section.auto.map(entry => (
              <Link
                key={entry.id}
                href={`/graph?id=${encodeURIComponent(entry.id)}`}
                className="px-3 py-1.5 text-sm font-serif bg-[var(--card)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent-light)] transition-colors"
              >
                {entry.label}
                {entry.works != null && (
                  <span className="ml-1 text-[10px] text-[var(--muted)]">{entry.works}</span>
                )}
              </Link>
            ))}
          </div>
          {section.autoTotal > section.auto.length && (
            <p className="text-xs text-[var(--muted)]">
              其余 {section.autoTotal - section.auto.length} 条请用上方检索框按词展开。
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function AtlasCard({ entry }: { entry: GraphAtlasEntry }) {
  return (
    <Link
      href={`/graph?id=${encodeURIComponent(entry.id)}`}
      className="block p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent-light)] transition-colors"
    >
      <p className="font-serif mb-1">{entry.label}</p>
      {entry.shortDef && (
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">
          {entry.shortDef}
          <span className="ml-1 text-[10px] text-[var(--muted)]">（词表释义）</span>
        </p>
      )}
      {entry.works != null && (
        <p className="text-[10px] text-[var(--muted)] mt-2">全库 {entry.works} 部典籍提及</p>
      )}
    </Link>
  );
}
