import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import MusicThemes from './MusicThemes';

export const metadata: Metadata = {
  title: '道乐 · 音律殿堂',
  description: '五行、八卦、十天干、十二时辰、二十四节气为主题的道教风格背景音乐，与《道德经》经文聆听。适合阅读道藏典籍时作背景氛围。',
};

const DAODEJING_1 =
  '道可道，非常道；名可名，非常名。无名，天地之始；有名，万物之母。' +
  '故常无欲，以观其妙；常有欲，以观其徼。此两者，同出而异名，同谓之玄。玄之又玄，众妙之门。';

export default function MusicPage() {
  return (
    <div className="animate-fade-in">
      <div className="relative w-full aspect-[21/9] rounded-lg overflow-hidden mb-8 border border-[var(--border)]">
        <Image src="/images/hero.jpg" alt="云雾山间道观水墨画" fill priority sizes="(max-width: 896px) 100vw, 896px" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent flex items-end">
          <div className="p-6 text-white">
            <h1 className="text-2xl md:text-3xl font-serif tracking-widest mb-1">道乐 · 音律殿堂</h1>
            <p className="text-xs md:text-sm opacity-90">大音希声 —— 五行 · 八卦 · 天干 · 时辰 · 节气</p>
          </div>
        </div>
      </div>

      <MusicThemes />

      <section className="mt-14">
        <h2 className="text-lg font-serif tracking-wider mb-4">经文聆听 · 《道德经》第一章</h2>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-5">
          <blockquote className="text-sm font-serif leading-loose text-[var(--text-secondary)] mb-4">{DAODEJING_1}</blockquote>
          <audio controls preload="none" src="/audio/daodejing-01.mp3" className="w-full h-10" />
          <p className="text-xs text-[var(--muted)] mt-3">
            朗读语音由 AI 合成（MiniMax speech-2.8-hd），请以
            <Link href="/search?q=%E9%81%93%E5%BE%B7%E7%BB%8F" className="text-[var(--accent)] hover:underline mx-0.5">原文</Link>
            为准。
          </p>
        </div>
      </section>

      <p className="text-xs text-[var(--muted)] mt-10 pt-4 border-t border-[var(--border)]">
        本页音乐与配图均由 AI 生成（音乐与语音：MiniMax；配图：LibTV / Seedream），为氛围辅助内容。
      </p>
    </div>
  );
}
