'use client';

import { useSyncExternalStore } from 'react';
import { MusicTheme, TRACKS_BY_THEME } from '@/lib/music-catalog';
import { mediaUrl } from '@/lib/media-url';
import {
  MusicPlayerPersist,
  DEFAULT_MUSIC_PLAYER,
  getMusicPlayerState,
  saveMusicPlayerState,
  trackEvent,
} from '@/lib/user-data';
import type { MusicTrack } from '@/app/(site)/music/MusicPlayer';

export interface MusicRuntimeState extends MusicPlayerPersist {
  playing: boolean;
  barVisible: boolean;
}

/**
 * 初始态必须与 SERVER_MUSIC_SNAPSHOT 一致。
 * 禁止在模块加载时读 localStorage：客户端预水合读到 trackId 会导致
 * GlobalMusicBar 服务端 null、客户端有 DOM，触发 hydration mismatch。
 * 持久化恢复只走 MusicProvider 里的 hydrateFromStorage（useEffect）。
 */
let runtime: MusicRuntimeState = {
  ...DEFAULT_MUSIC_PLAYER,
  playing: false,
  barVisible: false,
};
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(cb => cb());
}

function persist() {
  saveMusicPlayerState({
    backgroundEnabled: runtime.backgroundEnabled,
    loop: runtime.loop,
    theme: runtime.theme,
    trackId: runtime.trackId,
    currentTime: runtime.currentTime,
  });
}

export function getMusicSnapshot(): MusicRuntimeState {
  return runtime;
}

export function subscribeMusic(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getCurrentTrack(): MusicTrack | null {
  if (!runtime.trackId) return null;
  const theme = runtime.theme as MusicTheme;
  return TRACKS_BY_THEME[theme]?.find(t => t.id === runtime.trackId) ?? null;
}

export function getThemeTracks(theme?: MusicTheme): MusicTrack[] {
  const t = theme ?? (runtime.theme as MusicTheme);
  return TRACKS_BY_THEME[t] ?? [];
}

export const musicActions = {
  setBackgroundEnabled(enabled: boolean) {
    runtime = { ...runtime, backgroundEnabled: enabled, barVisible: enabled && !!runtime.trackId };
    persist();
    emit();
  },

  setLoop(loop: boolean) {
    runtime = { ...runtime, loop };
    persist();
    emit();
  },

  play(theme: MusicTheme, track: MusicTrack, audio?: HTMLAudioElement) {
    const same = runtime.theme === theme && runtime.trackId === track.id;
    runtime = {
      ...runtime,
      theme,
      trackId: track.id,
      playing: true,
      barVisible: runtime.backgroundEnabled,
    };
    if (audio) {
      // endsWith(track.audio) 仍成立：CDN 前缀后 URL 仍以 /audio/xx.mp3 结尾
      if (!same || !audio.src.endsWith(track.audio)) {
        audio.src = mediaUrl(track.audio);
        audio.currentTime = same ? runtime.currentTime : 0;
      }
      audio.loop = runtime.loop;
      audio.play().catch(() => {});
    }
    persist();
    emit();
    trackEvent('music_play', { theme, trackId: track.id, title: track.title });
  },

  toggle(theme: MusicTheme, track: MusicTrack, audio?: HTMLAudioElement) {
    if (runtime.theme === theme && runtime.trackId === track.id && runtime.playing) {
      musicActions.pause(audio);
      return;
    }
    if (runtime.theme === theme && runtime.trackId === track.id) {
      runtime = { ...runtime, playing: true, barVisible: runtime.backgroundEnabled };
      audio?.play().catch(() => {});
      emit();
      return;
    }
    musicActions.play(theme, track, audio);
  },

  pause(audio?: HTMLAudioElement) {
    audio?.pause();
    runtime = { ...runtime, playing: false };
    emit();
    trackEvent('music_pause', { theme: runtime.theme, trackId: runtime.trackId });
  },

  resume(audio?: HTMLAudioElement) {
    runtime = { ...runtime, playing: true, barVisible: runtime.backgroundEnabled };
    audio?.play().catch(() => {});
    emit();
  },

  stop(audio?: HTMLAudioElement) {
    audio?.pause();
    if (audio) audio.currentTime = 0;
    runtime = { ...runtime, playing: false, trackId: null, currentTime: 0, barVisible: false };
    persist();
    emit();
  },

  syncTime(t: number) {
    runtime = { ...runtime, currentTime: t };
  },

  persistTime() {
    persist();
  },

  prev(audio?: HTMLAudioElement) {
    const tracks = getThemeTracks();
    if (!runtime.trackId || tracks.length === 0) return;
    const idx = tracks.findIndex(t => t.id === runtime.trackId);
    const prev = tracks[(idx - 1 + tracks.length) % tracks.length];
    musicActions.play(runtime.theme as MusicTheme, prev, audio);
  },

  next(audio?: HTMLAudioElement) {
    const tracks = getThemeTracks();
    if (!runtime.trackId || tracks.length === 0) return;
    const idx = tracks.findIndex(t => t.id === runtime.trackId);
    const nxt = tracks[(idx + 1) % tracks.length];
    musicActions.play(runtime.theme as MusicTheme, nxt, audio);
  },

  hydrateFromStorage() {
    const stored = getMusicPlayerState();
    runtime = {
      ...runtime,
      ...stored,
      playing: false,
      // 有曲目且开启背景道乐时才显示底栏（与用户上次会话对齐）
      barVisible: stored.backgroundEnabled && !!stored.trackId,
    };
    emit();
  },

  bindAudio(audio: HTMLAudioElement) {
    if (!runtime.trackId) return;
    const track = getCurrentTrack();
    if (!track) return;
    audio.src = mediaUrl(track.audio);
    audio.loop = runtime.loop;
    audio.currentTime = runtime.currentTime;
    if (runtime.playing) audio.play().catch(() => {});
  },
};

export const globalAudioRef: { current: HTMLAudioElement | null } = { current: null };

/** SSR 快照必须是稳定引用，否则 useSyncExternalStore 会无限重渲染 */
const SERVER_MUSIC_SNAPSHOT: MusicRuntimeState = {
  ...DEFAULT_MUSIC_PLAYER,
  playing: false,
  barVisible: false,
};

function getServerMusicSnapshot(): MusicRuntimeState {
  return SERVER_MUSIC_SNAPSHOT;
}

function trackFromState(state: MusicRuntimeState): MusicTrack | null {
  if (!state.trackId) return null;
  const theme = state.theme as MusicTheme;
  return TRACKS_BY_THEME[theme]?.find(t => t.id === state.trackId) ?? null;
}

export function useMusicPlayer() {
  // 水合阶段用 getServerMusicSnapshot；track/tracks 必须从同一 snapshot 推导，
  // 不可再读模块级 runtime（否则客户端会提前看到 localStorage 曲目）
  const state = useSyncExternalStore(subscribeMusic, getMusicSnapshot, getServerMusicSnapshot);
  const theme = state.theme as MusicTheme;

  return {
    state,
    track: trackFromState(state),
    tracks: TRACKS_BY_THEME[theme] ?? [],
    actions: musicActions,
  };
}
