'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { trackEvent } from '@/lib/user-data';

/**
 * 五行道乐播放器（客户端）。
 *
 * 设计要点：
 * - 全页共用一个 <audio> 元素：同一时刻只播一首（五行音律不宜叠放），
 *   切换即换源，避免五个音频元素抢占资源；
 * - 循环开关默认开启：定位是阅读背景乐，循环播放是主要使用方式；
 * - 音频文件为 AI 生成（MiniMax music-2.6），页面明确标注来源。
 */

export interface MusicTrack {
  id: string;
  element: string;
  title: string;
  description: string;
  audio: string;
  image: string;
  /** 五行主色（用于卡片角标） */
  color: string;
}

export default function MusicPlayer({ tracks }: { tracks: MusicTrack[] }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [progress, setProgress] = useState(0);

  const current = tracks.find(t => t.id === currentId) ?? null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      setProgress(audio.duration > 0 ? audio.currentTime / audio.duration : 0);
    };
    const onEnd = () => setPlaying(false);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  const toggle = (track: MusicTrack) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentId === track.id) {
      if (playing) {
        audio.pause();
        setPlaying(false);
      } else {
        audio.play();
        setPlaying(true);
      }
      return;
    }

    audio.src = track.audio;
    audio.loop = loop;
    audio.play();
    setCurrentId(track.id);
    setPlaying(true);
    setProgress(0);
    trackEvent('page_view', { scope: 'music-play', track: track.id });
  };

  const toggleLoop = () => {
    const next = !loop;
    setLoop(next);
    if (audioRef.current) audioRef.current.loop = next;
  };

  return (
    <div>
      <audio ref={audioRef} preload="none" />

      {/* 五行卡片 */}
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
                {/* 播放状态浮层 */}
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
                {/* 五行角标 */}
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
                {/* 当前曲目进度条 */}
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

      {/* 播放控制条 */}
      <div className="mt-6 flex items-center justify-between text-xs text-[var(--muted)]">
        <span>{current ? `当前：${current.title}` : '点击卡片开始聆听'}</span>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={loop} onChange={toggleLoop} className="accent-[var(--accent)]" />
          循环播放（适合阅读时作背景）
        </label>
      </div>
    </div>
  );
}
