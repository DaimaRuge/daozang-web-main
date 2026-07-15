'use client';

import { useState } from 'react';
import MusicPlayer from '@/app/music/MusicPlayer';
import { BAGUA_TRACKS, MUSIC_THEMES, MusicTheme, WUXING_TRACKS } from '@/lib/music-catalog';

/** 道乐主题切换：五行 / 八卦，各主题独立播放器状态 */
export default function MusicThemes() {
  const [theme, setTheme] = useState<MusicTheme>('wuxing');
  const tracks = theme === 'wuxing' ? WUXING_TRACKS : BAGUA_TRACKS;

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        {MUSIC_THEMES.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
              theme === t.id
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {t.label}
            <span className="ml-2 text-xs opacity-60">{t.desc}</span>
          </button>
        ))}
      </div>

      <p className="text-sm text-[var(--muted)] leading-relaxed mb-6 max-w-2xl">
        {theme === 'wuxing'
          ? '五行对应五音（宫商角徵羽），是道教乐理的基本框架。以下器乐依五行意象生成，适合阅读时作背景氛围。'
          : '八卦取象天地雷风水火山泽，各卦有独特气韵。以下器乐依八卦意象生成，可随阅读内容切换心境。'}
      </p>

      <MusicPlayer key={theme} tracks={tracks} />
    </div>
  );
}
