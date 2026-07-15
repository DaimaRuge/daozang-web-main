import Image from 'next/image';
import { CategoryMeta } from '@/lib/catalog-meta';

/** 部类英雄横幅：配图 + 意境文案，营造「置身道藏」的目录入口感 */
export default function CategoryHero({ meta, total, sub }: { meta: CategoryMeta; total: number; sub?: string }) {
  return (
    <div className="relative w-full aspect-[21/7] md:aspect-[21/6] rounded-xl overflow-hidden mb-8 border border-[var(--border)]">
      <Image
        src={meta.heroImage}
        alt={`${meta.name}水墨意象`}
        fill
        priority
        sizes="(max-width: 896px) 100vw, 896px"
        className="object-cover"
      />
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(135deg, ${meta.accent}88 0%, transparent 55%, rgba(0,0,0,0.45) 100%)` }}
      />
      <div className="absolute inset-0 flex flex-col justify-end p-5 md:p-8 text-white">
        <p className="text-xs tracking-[0.3em] opacity-80 mb-1">{meta.tagline}</p>
        <h1 className="text-2xl md:text-3xl font-serif tracking-widest mb-2">{meta.name}</h1>
        {sub && <p className="text-sm opacity-90 mb-2">› {sub}</p>}
        <p className="text-xs md:text-sm opacity-85 max-w-2xl leading-relaxed line-clamp-2 md:line-clamp-none">
          {meta.description}
        </p>
        <p className="text-xs mt-3 opacity-70">共 {total.toLocaleString('zh-CN')} 部典籍</p>
      </div>
    </div>
  );
}
