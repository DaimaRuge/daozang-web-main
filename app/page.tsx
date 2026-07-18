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

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  );
}

export default function Home() {
  const index = getIndex();
  const recEntries = recommendations
    .map(title => index.entries.find(e => e.title.includes(title)))
    .filter(Boolean);

  const dailyEntry = pickDailyEntry(index.entries);

  return (
    <div className="animate-fade-in">
      {/* ============ Hero：沉浸式山水 + 题字 + 主搜索 ============ */}
      <section className="relative w-full rounded-xl overflow-hidden mb-14 border border-[var(--border)] min-h-[420px] md:min-h-[520px] flex items-center justify-center">
        <Image
          src="/images/site/home-hero.jpg"
          alt="云海仙山水墨长卷：松间道观与双鹤"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        {/* 自下而上的宣纸渐变：保证文字可读，同时保留画面上部的山势 */}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/45 to-transparent" />

        {/* 竖排题字：仅大屏展示，作东方式侧饰 */}
        <span className="vertical-text hidden lg:block absolute right-8 top-10 text-sm text-[var(--text-secondary)]/85 font-serif" aria-hidden>
          道法自然
        </span>
        <span className="vertical-text hidden lg:block absolute left-8 bottom-10 text-sm text-[var(--text-secondary)]/85 font-serif" aria-hidden>
          清靜無為
        </span>

        <div className="relative z-10 w-full max-w-2xl text-center px-6 py-14 md:py-20">
          <div className="flex items-end justify-center gap-3 mb-4">
            <h1 className="text-5xl md:text-7xl font-serif tracking-[0.22em] text-[var(--text)] [text-shadow:0_1px_12px_rgba(247,244,236,0.9)]">
              道可道
            </h1>
            <span className="seal-stamp text-[11px] md:text-xs mb-2" aria-hidden>道藏</span>
          </div>
          <p className="text-base md:text-lg text-[var(--text-secondary)] tracking-[0.5em] [text-indent:0.5em] mb-8 font-serif">
            非常道
          </p>

          {/* 主搜索：首页第一动作，置于画中 */}
          <form action="/search" method="get" className="mx-auto max-w-lg">
            <div className="relative group">
              <input
                type="text"
                name="q"
                placeholder="尋經問典 · 搜索经文名称、作者或正文"
                className="w-full pl-6 pr-14 py-4 bg-[var(--card)]/95 backdrop-blur-sm border border-[var(--border)] rounded-full text-sm md:text-base text-[var(--text)] font-serif placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(74,107,93,0.12)] transition-all shadow-[var(--shadow-soft)]"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-[var(--accent)] text-white hover:bg-[var(--accent-light)] transition-colors cursor-pointer"
                aria-label="搜索"
              >
                <SearchIcon />
              </button>
            </div>
          </form>

          <p className="mt-8 text-xs md:text-sm text-[var(--text-secondary)] tracking-wider">
            正統道藏 · 續道藏 &nbsp;｜&nbsp; {index.totalEntries.toLocaleString()} 部經典 &nbsp;｜&nbsp; 免費在線研讀
          </p>
        </div>
      </section>

      {/* 继续阅读：仅对有本地阅读记录的用户展示 */}
      <ContinueReading />

      {/* ============ 每日一经：卷轴式静心一隅 ============ */}
      {dailyEntry && (
        <section className="mb-16 animate-rise">
          <div className="relative overflow-hidden rounded-xl border border-[var(--border)] shadow-[var(--shadow-soft)]">
            <Image
              src="/images/site/clouds-band.jpg"
              alt=""
              fill
              sizes="100vw"
              className="object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-[var(--card)]/70" />
            <div className="relative z-10 px-6 py-10 md:py-12 text-center">
              <p className="text-xs text-[var(--muted)] tracking-[0.4em] [text-indent:0.4em] mb-4">每 日 一 經</p>
              <Link
                href={`/text/${dailyEntry.id}`}
                className="inline-block text-xl md:text-2xl font-serif tracking-wider text-[var(--accent)] hover:opacity-80 transition-opacity"
              >
                {dailyEntry.title}
              </Link>
              <p className="text-xs text-[var(--text-secondary)] mt-2 tracking-wider">
                {dailyEntry.collection} · {dailyEntry.category}
              </p>
              {dailyEntry.preview && (
                <p className="text-sm text-[var(--text-secondary)] mt-5 line-clamp-3 max-w-xl mx-auto leading-loose font-serif">
                  {dailyEntry.preview.slice(0, 120)}……
                </p>
              )}
              <Link
                href={`/text/${dailyEntry.id}`}
                className="inline-block mt-6 px-6 py-2 text-sm border border-[var(--accent)] text-[var(--accent)] rounded-full hover:bg-[var(--accent)] hover:text-white transition-colors"
              >
                展卷靜讀
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ============ 分类浏览 ============ */}
      <section className="mb-16 animate-rise animate-rise-delay-1">
        <div className="ink-divider mb-8">
          <h2 className="section-title text-lg">分類瀏覽</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {index.categories.map(cat => {
            const meta = getCategoryMeta(cat.name);
            return (
              <Link
                key={cat.name}
                href={`/catalog?cat=${encodeURIComponent(cat.name)}`}
                className="group relative overflow-hidden bg-[var(--card)] border border-[var(--border)] rounded-lg hover:border-[var(--accent-light)] hover:shadow-[0_4px_20px_rgba(43,41,38,0.08)] transition-all text-center min-h-[136px] flex flex-col justify-end shadow-[var(--shadow-soft)] cursor-pointer"
              >
                <Image
                  src={meta.heroImage}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover opacity-20 group-hover:opacity-35 group-hover:scale-105 transition-all duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--card)]/90 via-[var(--card)]/50 to-transparent" />
                <div className="relative z-10 p-5">
                  <div className="text-2xl font-serif text-[var(--accent)] mb-1">{cat.count}</div>
                  <div className="text-sm text-[var(--text)] group-hover:text-[var(--accent)] transition-colors font-medium tracking-wider">
                    {meta.name || '續道藏'}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)] mt-1 line-clamp-1">{meta.tagline}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ============ 问道仙人：AI 问答入口 ============ */}
      <section className="mb-16 animate-rise animate-rise-delay-2">
        <div className="relative overflow-hidden rounded-xl border border-[var(--border)] shadow-[var(--shadow-soft)] bg-[var(--card)]">
          <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="relative aspect-[16/10] md:aspect-auto md:min-h-[300px]">
              <Image
                src="/images/site/ask-banner.jpg"
                alt="松下问道：仙风道骨的老者与鹤"
                fill
                sizes="(max-width: 768px) 100vw, 42vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[var(--card)] hidden md:block" />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--card)] to-transparent md:hidden" />
            </div>
            <div className="relative px-6 md:px-10 py-8 md:py-12 flex flex-col justify-center">
              <span className="vertical-text hidden md:block absolute right-6 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)]" aria-hidden>
                松下問道
              </span>
              <p className="text-xs text-[var(--muted)] tracking-[0.4em] mb-3">問 道</p>
              <h2 className="text-xl md:text-2xl font-serif tracking-wider text-[var(--text)] mb-4">
                心有所惑，不妨一問
              </h2>
              <p className="text-sm text-[var(--text-secondary)] leading-loose max-w-md mb-6">
                經文古奧，義理幽深。向通曉道藏的智者請教——何為「清靜無為」？《黃庭經》講了什麼？
                所答皆有典可依，並附原文出處。
              </p>
              <div>
                <Link
                  href="/ask"
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-sm bg-[var(--accent)] text-white rounded-full hover:bg-[var(--accent-light)] transition-colors cursor-pointer"
                >
                  入山問道
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ 推荐经典 ============ */}
      {recEntries.length > 0 && (
        <section className="mb-16 animate-rise animate-rise-delay-2">
          <div className="ink-divider mb-8">
            <h2 className="section-title text-lg">入門經典</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recEntries.map(entry => entry && (
              <Link
                key={entry.id}
                href={`/text/${entry.id}`}
                className="flex items-center gap-4 px-5 py-4 bg-[var(--card)] border border-[var(--border)] rounded-lg hover:border-[var(--accent-light)] hover:shadow-[0_4px_16px_rgba(43,41,38,0.07)] transition-all group shadow-[var(--shadow-soft)] cursor-pointer"
              >
                <span className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-[var(--border)] text-xs text-[var(--text-secondary)] font-serif group-hover:border-[var(--accent-light)] group-hover:text-[var(--accent)] transition-colors">
                  {entry.category.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium font-serif tracking-wide text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate">
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

      {/* ============ 关于道藏：藏经阁配图 ============ */}
      <section className="mb-16 animate-rise animate-rise-delay-3">
        <div className="relative overflow-hidden rounded-xl border border-[var(--border)] shadow-[var(--shadow-soft)] bg-[var(--card)]">
          <div className="grid md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <div className="px-6 md:px-10 py-8 md:py-12 order-2 md:order-1">
              <p className="text-xs text-[var(--muted)] tracking-[0.4em] mb-3">緣 起</p>
              <h2 className="text-xl md:text-2xl font-serif tracking-wider text-[var(--text)] mb-4">關於道藏</h2>
              <div className="text-sm text-[var(--text-secondary)] leading-loose space-y-3 max-w-xl">
                <p>
                  《道藏》是道教經籍的總集，編纂始於唐代，歷經宋、金、元各代增修。明成祖永樂年間開始編纂，
                  至明英宗正統九年（1444 年）刊印完成，是為《正統道藏》。
                </p>
                <p>
                  明神宗萬曆三十五年（1607 年）又增補編纂《續道藏》。正續道藏合計收錄經文一千四百八十餘種、
                  五千四百餘卷，是中國傳統文化的重要寶庫。
                </p>
              </div>
              <Link href="/about" className="inline-block mt-6 text-sm text-[var(--accent)] hover:underline underline-offset-4">
                了解更多 →
              </Link>
            </div>
            <div className="relative aspect-[16/10] md:aspect-auto md:min-h-[280px] order-1 md:order-2">
              <Image
                src="/images/site/canon.jpg"
                alt="藏经阁一角：卷帙与檀香"
                fill
                sizes="(max-width: 768px) 100vw, 42vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-l from-transparent to-[var(--card)] hidden md:block" />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--card)] md:hidden" />
            </div>
          </div>
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
