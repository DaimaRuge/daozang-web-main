'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { trackEvent } from '@/lib/user-data';
import { MusicTheme } from '@/lib/music-catalog';
import { musicActions, useMusicPlayer, globalAudioRef } from '@/lib/use-music-player';

export interface MusicTrack {
  id: string;
  element: string;
  title: string;
  description: string;
  audio: string;
  image: string;
  color: string;
}

export default function MusicPlayer({
  tracks,
  theme,
}: {
  tracks: MusicTrack[];
  theme: MusicTheme;
}) {
  const { state } = useMusicPlayer();
  const [progress, setProgress] = useState(0);
  const audio = () => globalAudioRef.current ?? undefined;

  const currentId = state.theme === theme ? state.trackId : null;
  const playing = state.theme === theme && state.playing;
  const current = tracks.find(t => t.id === currentId) ?? null;

  useEffect(() => {
    const el = audio();
    if (!el) return;
    const onTime = () => {
      if (state.theme === theme && state.trackId) {
        setProgress(el.duration > 0 ? el.currentTime / el.duration : 0);
      }
    };
    el.addEventListener('timeupdate', onTime);
    return () => el.removeEventListener('timeupdate', onTime);
  }, [state.theme, state.trackId, theme]);

  const toggle = (track: MusicTrack) => {
    musicActions.toggle(theme, track, audio());
    trackEvent('page_view', { scope: 'music-play', track: track.id, theme });
  };

  const toggleLoop = () => {
    musicActions.setLoop(!state.loop);
    const el = audio();
    if (el) el.loop = !state.loop;
  };

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tracks.map(track => {
          const isCurrent = currentId === track.id;
          const isPlaying = isCurrent && playing;
          return (
            <button
              key={track.id}
              onClick={() => toggle(track)}
              className={`group text-left bg-[var(--card)] border rounded-lg overflow-hidden transition-all hover:shadow-[var(--shadow-soft)] ${
                isCurrent ? 'border-[var(--accent)]' : 'border-[var(--border)] hover:border-[var(--accent-light)]'
              }`}
              aria-pressed={isPlaying}
              aria-label={`${isPlaying ? '暂停' : '播放'}${track.title}`}
            >
              <div className="relative aspect-square">
                <Image
                  src={track.image}
                  alt={`${track.element}行水墨意象图`}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover"
                />
                <div
                  className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                    isPlaying ? 'bg-black/30 opacity-100' : 'bg-black/20 opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <span className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center text-[var(--accent)]">
                    {isPlaying ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>
                    )}
                  </span>
                </div>
                <span
                  className="absolute top-2.5 left-2.5 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-serif shadow"
                  style={{ backgroundColor: track.color }}
                >
                  {track.element}
                </span>
              </div>
              <div className="p-4">
                <h3 className="text-sm font-medium mb-1 flex items-center gap-2">
                  {track.title}
                  {isPlaying && <span className="text-[10px] text-[var(--accent)] animate-pulse">播放中</span>}
                </h3>
                <p className="text-xs text-[var(--muted)] leading-relaxed">{track.description}</p>
                {isCurrent && (
                  <div className="mt-2.5 h-1 bg-[var(--border)] rounded overflow-hidden">
                    <div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${progress * 100}%` }} />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between text-xs text-[var(--muted)]">
        <span>{current ? `当前：${current.title}` : '点击卡片开始聆听'}</span>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={state.loop} onChange={toggleLoop} className="accent-[var(--accent)]" />
          循环播放（适合阅读时作背景）
        </label>
      </div>
    </div>
  );
}
