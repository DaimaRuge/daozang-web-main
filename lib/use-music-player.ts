'use client';

import { useSyncExternalStore } from 'react';
import { MusicTheme, TRACKS_BY_THEME } from '@/lib/music-catalog';
import {
  MusicPlayerPersist,
  DEFAULT_MUSIC_PLAYER,
  getMusicPlayerState,
  saveMusicPlayerState,
  trackEvent,
} from '@/lib/user-data';
import type { MusicTrack } from '@/app/music/MusicPlayer';

export interface MusicRuntimeState extends MusicPlayerPersist {
  playing: boolean;
  barVisible: boolean;
}

let runtime: MusicRuntimeState = {
  ...getMusicPlayerState(),
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
      if (!same || !audio.src.endsWith(track.audio)) {
        audio.src = track.audio;
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
    runtime = { ...runtime, ...getMusicPlayerState(), playing: false };
    emit();
  },

  bindAudio(audio: HTMLAudioElement) {
    if (!runtime.trackId) return;
    const track = getCurrentTrack();
    if (!track) return;
    audio.src = track.audio;
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

export function useMusicPlayer() {
  const state = useSyncExternalStore(subscribeMusic, getMusicSnapshot, getServerMusicSnapshot);

  return {
    state,
    track: getCurrentTrack(),
    tracks: getThemeTracks(),
    actions: musicActions,
  };
}
