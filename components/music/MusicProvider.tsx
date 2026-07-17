'use client';

import { useEffect, useRef } from 'react';
import { musicActions, useMusicPlayer, globalAudioRef } from '@/lib/use-music-player';
import GlobalMusicBar from './GlobalMusicBar';

/** 全局道乐：单一 audio 实例，跨页面持续播放 */
export default function MusicProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { state } = useMusicPlayer();

  useEffect(() => {
    musicActions.hydrateFromStorage();
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    musicActions.bindAudio(audio);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.trackId) return;
    const onTime = () => musicActions.syncTime(audio.currentTime);
    const onEnd = () => {
      if (!audio.loop) musicActions.pause(audio);
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
      musicActions.persistTime();
    };
  }, [state.trackId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.loop = state.loop;
  }, [state.loop]);

  return (
    <>
      {children}
      <audio
        ref={el => {
          audioRef.current = el;
          globalAudioRef.current = el;
        }}
        preload="none"
        className="hidden"
        aria-hidden
      />
      <GlobalMusicBar audioRef={audioRef} />
    </>
  );
}
