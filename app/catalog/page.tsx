import { Suspense } from 'react';
import { getIndex, filterEntriesByCategory } from '@/lib/data';
import { getCategoryMeta } from '@/lib/catalog-meta';
import CategoryHero from '@/components/catalog/CategoryHero';
import CategoryNav from '@/components/catalog/CategoryNav';
import CatalogExplorer from '@/components/catalog/CatalogExplorer';

interface PageProps {
  searchParams: Promise<{ cat?: string; sub?: string }>;
}

/**
 * 经文目录（服务端组件）。
 *
 * 体验升级要点：
 * - 部类英雄横幅 + 配图侧栏，营造「置身道藏」的空间感；
 * - 探索路径、标签云、本地搜索/排序，降低 1500+ 部典籍的找书成本；
 * - 卡片式书目展示（摘要、标签、篇幅），取代单调纯文本列表。
 */
export default async function CatalogPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const index = getIndex();
  // cat 为空字符串表示续道藏（index 中 category 为 ""）
  const cat = params.cat !== undefined ? params.cat : index.categories[0]?.name ?? '';
  const sub = params.sub ?? '';

  const entries = filterEntriesByCategory(cat, sub || undefined);
  const meta = getCategoryMeta(cat);
  const currentCategory = index.categories.find(c => c.name === cat);

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-10">
        <aside className="lg:w-52 shrink-0">
          <CategoryNav categories={index.categories} activeCat={cat} activeSub={sub} />
        </aside>

        <div className="flex-1 min-w-0">
          <CategoryHero meta={meta} total={entries.length} sub={sub || undefined} />

          <Suspense fallback={<p className="text-sm text-[var(--muted)] py-8">加载目录…</p>}>
            <CatalogExplorer
              entries={entries}
              meta={meta}
              cat={cat}
              sub={sub}
              subcategories={currentCategory?.subcategories ?? []}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
