'use client';

import Link from 'next/link';
import { RefObject } from 'react';
import { musicActions, useMusicPlayer } from '@/lib/use-music-player';

export default function GlobalMusicBar({ audioRef }: { audioRef: RefObject<HTMLAudioElement | null> }) {
  const { state, track } = useMusicPlayer();
  const audio = () => audioRef.current ?? undefined;

  if (!state.backgroundEnabled || !track) return null;

  const togglePlay = () => {
    if (state.playing) musicActions.pause(audio());
    else musicActions.resume(audio());
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[60] border-t border-[var(--border)] bg-[var(--card)]/95 backdrop-blur px-4 py-2.5 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
      role="region"
      aria-label="道乐播放控制"
    >
      <div className="max-w-4xl mx-auto flex items-center gap-3">
        <button
          type="button"
          onClick={() => musicActions.prev(audio())}
          className="p-2 text-[var(--muted)] hover:text-[var(--accent)]"
          aria-label="上一曲"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
        </button>
        <button
          type="button"
          onClick={togglePlay}
          className="p-2 w-10 h-10 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shrink-0"
          aria-label={state.playing ? '暂停' : '播放'}
        >
          {state.playing ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>
          )}
        </button>
        <button
          type="button"
          onClick={() => musicActions.next(audio())}
          className="p-2 text-[var(--muted)] hover:text-[var(--accent)]"
          aria-label="下一曲"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 18h2V6h-2zM6 18l8.5-6L6 6z"/></svg>
        </button>

        <Link href="/music" className="flex-1 min-w-0 text-sm truncate hover:text-[var(--accent)]">
          <span className="text-[var(--muted)] text-xs mr-1">道乐</span>
          {track.title}
        </Link>

        <button
          type="button"
          onClick={() => musicActions.stop(audio())}
          className="p-2 text-[var(--muted)] hover:text-[var(--text)]"
          aria-label="关闭播放器"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
