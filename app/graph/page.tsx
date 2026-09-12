import Link from 'next/link';
import type { Metadata } from 'next';
import {
  expandNode,
  getGraphStats,
  graphViewForQuery,
  isGraphAvailable,
} from '@/lib/graph/query';
import { NODE_ORIGIN_LABELS, NODE_TYPE_LABELS } from '@/lib/graph/schema';
import GraphExplorer from '@/components/graph/GraphExplorer';

/**
 * 知识图谱页（服务端组件）。
 *
 * 为什么中心点写在 URL 里（?id= 或 ?q=）：
 * 每一个「局部视图」都是一个可分享、可收藏、可被索引的地址，
 * 浏览器前进后退天然承担「上一跳 / 下一跳」的导航语义 ——
 * 这正是「从局部逐跳展开」这一交互的最简实现。
 */

interface PageProps {
  searchParams: Promise<{ q?: string; id?: string }>;
}

/** 图谱页的探索起点：覆盖符箓、内丹、科仪等主要语义域 */
const SEED_ENTRIES = [
  { label: '符籙', id: 'concept:fulu' },
  { label: '雷法', id: 'concept:leifa' },
  { label: '內丹', id: 'concept:neidan' },
  { label: '齋醮', id: 'ritual:zhaijiao' },
  { label: '授籙', id: 'ritual:shoulu' },
  { label: '正一', id: 'sect:zhengyi' },
  { label: '上清', id: 'sect:shangqing' },
  { label: '靈寶', id: 'sect:lingbao' },
  { label: '真武', id: 'deity:zhenwu' },
  { label: '張道陵', id: 'person:zhangdaoling' },
  { label: '茅山', id: 'place:maoshan' },
  { label: '存思', id: 'concept:cunsi' },
];

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { q, id } = await searchParams;
  const focus = q || (id ? id.split(':')[1] : '');
  const title = focus ? `${focus} · 关联图谱 | 道可道` : '道藏知识图谱 | 道可道';
  return {
    title,
    description: '以概念、宗派、人物、科仪为节点，展开道藏典籍之间的关联，并可回溯到原文出处。',
  };
}

export default async function GraphPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = (params.q ?? '').trim();
  const id = (params.id ?? '').trim();

  const available = isGraphAvailable();
  const view = !available ? null : id ? expandNode(id) : query ? graphViewForQuery(query) : null;
  const stats = getGraphStats();

  return (
    <div className="animate-fade-in">
      <header className="mb-6">
        <h1 className="text-2xl font-serif tracking-[0.2em] [text-indent:0.2em] mb-2">關聯圖譜</h1>
        <p className="text-sm text-[var(--muted)] leading-relaxed max-w-2xl">
          道藏卷帙浩繁，与其从头读起，不如从一个感兴趣的点向外走。
          输入一个词或选一个入口，图谱会给出与它相关的概念、宗派、人物、科仪与典籍，
          每条关系都标明来源，可回溯到原文那一段。
        </p>
      </header>

      {/* 检索表单：与站内搜索同一交互习惯，URL 驱动 */}
      <form action="/graph" method="get" className="mb-6 max-w-xl">
        <div className="relative">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="输入概念、宗派、人物或科仪，如「符箓」"
            className="w-full pl-5 pr-24 py-3 bg-[var(--card)] border border-[var(--border)] rounded-full text-sm font-serif focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-1.5 text-sm rounded-full bg-[var(--accent)] text-white hover:bg-[var(--accent-light)] transition-colors cursor-pointer"
          >
            展开
          </button>
        </div>
      </form>

      {!available && (
        <p className="p-4 rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--muted)]">
          图谱数据尚未构建。请在项目根目录运行 <code className="font-mono">npm run build-graph</code> 后重新访问。
        </p>
      )}

      {available && !view && !query && (
        <section>
          <h2 className="text-sm text-[var(--muted)] tracking-wider mb-3">从这些入口开始</h2>
          <div className="flex flex-wrap gap-2 mb-8">
            {SEED_ENTRIES.map(seed => (
              <Link
                key={seed.id}
                href={`/graph?id=${encodeURIComponent(seed.id)}`}
                className="px-4 py-1.5 text-sm font-serif bg-[var(--card)] border border-[var(--border)] rounded-full text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent-light)] transition-colors"
              >
                {seed.label}
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
              ；关系分为目录事实、词表策展、原文提及与统计推算，界面上均如实标注。
            </p>
          )}
        </section>
      )}

      {available && view && (
        <section>
          <div className="flex items-baseline gap-3 flex-wrap mb-1">
            <h2 className="text-lg font-serif">{view.center.label}</h2>
            <span className="text-[10px] text-[var(--muted)] px-1.5 py-0.5 border border-[var(--border)] rounded">
              {NODE_TYPE_LABELS[view.center.type]}
            </span>
            {view.center.origin === 'auto' && (
              <span className="text-[10px] text-[var(--cinnabar)] px-1.5 py-0.5 border border-[var(--border)] rounded">
                {NODE_ORIGIN_LABELS.auto}
              </span>
            )}
            {view.center.works != null && (
              <span className="text-xs text-[var(--muted)]">全库 {view.center.works} 部典籍提及</span>
            )}
          </div>

          {view.center.shortDef && (
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-1 max-w-2xl">
              {view.center.shortDef}
              {!view.synthetic && view.center.origin !== 'auto' && (
                <span className="ml-1 text-[10px] text-[var(--muted)]">（词表释义，非典籍原文）</span>
              )}
            </p>
          )}
          {view.center.origin === 'auto' && (
            <p className="text-xs text-[var(--muted)] leading-relaxed mb-1">
              由语料统计自动识别，无词表释义；典籍数与原文出处即其证据。
            </p>
          )}
          {view.note && <p className="text-xs text-[var(--muted)] mb-4">{view.note}</p>}

          <div className="mt-4">
            <GraphExplorer view={view} />
          </div>

          <p className="mt-6 text-xs text-[var(--muted)]">
            也可以
            <Link href={`/search?q=${encodeURIComponent(view.center.label)}&mode=full`} className="text-[var(--accent)] hover:underline mx-1">
              在全文中检索「{view.center.label}」
            </Link>
            查看逐条原文命中。
          </p>
        </section>
      )}

      {available && !view && query && (
        <p className="text-sm text-[var(--muted)] py-6">
          未能就「{query}」建立关联视图。可尝试更常见的术语，或
          <Link href={`/search?q=${encodeURIComponent(query)}&mode=full`} className="text-[var(--accent)] hover:underline mx-1">
            全文搜索
          </Link>
          。
        </p>
      )}
    </div>
  );
}
