import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getIndex } from '@/lib/data';
import { getCategoryMeta } from '@/lib/catalog-meta';
import ContinueReading from '@/components/ContinueReading';

const recommendations = [
  '道德經',
  '清靜經',
  '陰符經',
  '悟真篇',
  '黃庭經',
  '坐忘論',
  '周易參同契',
  '度人經',
];

/** 每日推荐：按自然日轮换。抽成组件外的辅助函数以保持渲染纯函数约束 */
function pickDailyEntry<T>(entries: T[]): T | undefined {
  const dayIndex = Math.floor(Date.now() / 86400000) % entries.length;
  return entries[dayIndex];
}

export default function Home() {
  const index = getIndex();
  const recEntries = recommendations
    .map(title => index.entries.find(e => e.title.includes(title)))
    .filter(Boolean);

  const dailyEntry = pickDailyEntry(index.entries);

  return (
    <div className="animate-fade-in">
      {/* Hero：背景图 + 渐变遮罩 + 实底卡片，确保文字智明可读（参考道乐页） */}
      <section className="relative w-full aspect-[21/9] min-h-[280px] rounded-xl overflow-hidden mb-8 border border-[var(--border)]">
        <Image
          src="/images/hero.jpg"
          alt="云雾山间道观水墨画"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/75 to-[var(--bg)]/25" />
        <div className="absolute inset-0 flex items-center justify-center px-4">
          <div className="w-full max-w-2xl text-center bg-[var(--card)]/92 backdrop-blur-[2px] border border-[var(--border)] rounded-lg px-6 py-8 md:py-10 shadow-[var(--shadow-soft)]">
            <h1 className="text-4xl md:text-6xl font-serif tracking-[0.25em] text-[var(--accent)] mb-3">
              道可道
            </h1>
            <p className="text-base md:text-lg text-[var(--text-secondary)] tracking-[0.35em] mb-5">非常道</p>
            <p className="text-sm md:text-base text-[var(--text)] leading-relaxed max-w-lg mx-auto">
              道藏经文在线阅读平台，收录正统道藏、续道藏共计 {index.totalEntries.toLocaleString()} 部经典文献
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-3">仅供学术研究与个人学习用途</p>
          </div>
        </div>
      </section>

      {/* Search */}
      <section className="mb-16">
        <form action="/search" method="get" className="flex justify-center">
          <div className="relative w-full max-w-md">
            <input
              type="text"
              name="q"
              placeholder="搜索经文名称、作者..."
              className="w-full px-5 py-3 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-colors shadow-[var(--shadow-soft)]"
            />
            <button
              type="submit"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
              aria-label="搜索"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </button>
          </div>
        </form>
      </section>

      {/* 继续阅读：仅对有本地阅读记录的用户展示 */}
      <ContinueReading />

      {/* Daily Pick */}
      {dailyEntry && (
        <section className="mb-16 p-6 bg-[var(--card)] border border-[var(--border)] rounded-lg text-center shadow-[var(--shadow-soft)]">
          <p className="text-xs text-[var(--text-secondary)] mb-3 tracking-wider">每日推荐</p>
          <Link href={`/text/${dailyEntry.id}`} className="text-lg font-serif text-[var(--accent)] hover:opacity-80 transition-opacity">
            {dailyEntry.title}
          </Link>
          <p className="text-xs text-[var(--text-secondary)] mt-2">{dailyEntry.collection} · {dailyEntry.category}</p>
          {dailyEntry.preview && (
            <p className="text-sm text-[var(--text-secondary)] mt-3 line-clamp-3 max-w-lg mx-auto leading-relaxed">
              {dailyEntry.preview.slice(0, 150)}...
            </p>
          )}
        </section>
      )}

      {/* Categories */}
      <section className="mb-16">
        <h2 className="text-lg font-serif tracking-wider mb-6 text-center text-[var(--text-secondary)]">分类浏览</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {index.categories.map(cat => {
            const meta = getCategoryMeta(cat.name);
            return (
              <Link
                key={cat.name}
                href={`/catalog?cat=${encodeURIComponent(cat.name)}`}
                className="group relative overflow-hidden p-5 bg-[var(--card)] border border-[var(--border)] rounded-lg hover:border-[var(--accent-light)] transition-all text-center min-h-[120px] flex flex-col justify-end shadow-[var(--shadow-soft)]"
              >
                <Image
                  src={meta.heroImage}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover opacity-15 group-hover:opacity-25 transition-opacity"
                />
                <div className="absolute inset-0 bg-[var(--card)]/55 group-hover:bg-[var(--card)]/45 transition-colors" />
                <div className="relative z-10">
                  <div className="text-2xl font-serif text-[var(--accent)] mb-1">{cat.count}</div>
                  <div className="text-sm text-[var(--text)] group-hover:text-[var(--accent)] transition-colors font-medium">
                    {meta.name || '续道藏'}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)] mt-1 line-clamp-1">{meta.tagline}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Recommendations */}
      {recEntries.length > 0 && (
        <section className="mb-16">
          <h2 className="text-lg font-serif tracking-wider mb-6 text-center text-[var(--text-secondary)]">推荐经典</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recEntries.map(entry => entry && (
              <Link
                key={entry.id}
                href={`/text/${entry.id}`}
                className="flex items-center gap-4 px-5 py-4 bg-[var(--card)] border border-[var(--border)] rounded-lg hover:bg-[var(--card-hover)] transition-all group shadow-[var(--shadow-soft)]"
              >
                <span className="text-xs text-[var(--text-secondary)] shrink-0">{entry.category.slice(0, 2)}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">
                    {entry.title}
                  </div>
                  {entry.author && (
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">{entry.author}</div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* About Section */}
      <section className="mb-16 p-8 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-[var(--shadow-soft)]">
        <h2 className="text-lg font-serif tracking-wider mb-4 text-center text-[var(--text)]">关于道藏</h2>
        <div className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-2xl mx-auto space-y-3">
          <p>
            《道藏》是道教经籍的总集，编纂始于唐代，历经宋、金、元各代增修。明成祖永乐年间开始编纂，至明英宗正统九年（1444年）刊印完成，是为《正统道藏》。
          </p>
          <p>
            明神宗万历三十五年（1607年）又增补编纂《续道藏》。正续道藏合计收录经文一千四百八十余种，五千四百余卷，是中国传统文化的重要宝库。
          </p>
        </div>
        <div className="text-center mt-6">
          <Link href="/about" className="text-sm text-[var(--accent)] hover:opacity-80 transition-opacity">
            了解更多 →
          </Link>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="text-center py-8 border-t border-[var(--border)]">
        <p className="text-xs text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
          本站所有文本数据来源于开源项目，仅供学术研究与个人学习用途。
          文本版权归原作者及相关机构所有，请勿用于任何商业用途。
        </p>
      </section>
    </div>
  );
}
