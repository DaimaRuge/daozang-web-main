'use client';

import { useState } from 'react';
import MusicPlayer from '@/app/music/MusicPlayer';
import { MUSIC_THEMES, MusicTheme, THEME_INTRO, TRACKS_BY_THEME } from '@/lib/music-catalog';

/** 道乐主题切换：五行 / 八卦 / 天干 / 时辰 / 节气 */
export default function MusicThemes() {
  const [theme, setTheme] = useState<MusicTheme>('wuxing');
  const tracks = TRACKS_BY_THEME[theme];

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        {MUSIC_THEMES.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
              theme === t.id
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)] hover:border-[var(--accent-light)]'
            }`}
          >
            <span className="font-medium">{t.label}</span>
            <span className="ml-1.5 text-xs opacity-70">{t.desc}</span>
          </button>
        ))}
      </div>

      <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6 max-w-2xl">
        {THEME_INTRO[theme]}
      </p>

      <MusicPlayer key={theme} tracks={tracks} />
    </div>
  );
}
