'use client';

import { useCallback, useRef, useSyncExternalStore } from 'react';
import {
  ReaderSettings,
  DEFAULT_READER_SETTINGS,
  getReaderSettings,
  saveReaderSettings,
} from './user-data';

/**
 * 水合安全的「浏览器本地数据」读取 Hook。
 *
 * 为什么需要它：最近阅读、收藏、笔记等数据只存在于 localStorage，
 * 服务端渲染时不可见。若在 useEffect 里同步 setState 会触发级联渲染
 * （react-hooks/set-state-in-effect），因此改用 useSyncExternalStore：
 * 服务端快照返回 fallback，客户端首次读取后缓存，行为对 SSR 完全安全。
 *
 * 注意：fallback 必须是模块级稳定引用（如模块常量空数组），
 * 否则服务端快照每次返回新对象会导致无限重渲染。
 */
export function useLocalData<T>(read: () => T, fallback: T): [T, () => void] {
  const cache = useRef<{ value: T } | null>(null);
  const listeners = useRef(new Set<() => void>());

  const subscribe = useCallback((cb: () => void) => {
    const set = listeners.current;
    set.add(cb);
    return () => set.delete(cb);
  }, []);

  const value = useSyncExternalStore(
    subscribe,
    () => {
      if (cache.current === null) cache.current = { value: read() };
      return cache.current.value;
    },
    () => fallback,
  );

  /** 本地数据变更（如删除收藏）后调用，强制重新读取 */
  const refresh = useCallback(() => {
    cache.current = { value: read() };
    listeners.current.forEach(cb => cb());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read 为调用方内联闭包，仅手动触发时使用最新值即可
  }, []);

  return [value, refresh];
}

// ---------- 阅读器设置的全局共享存储 ----------

/**
 * 阅读器设置使用模块级 store 而非组件局部 state：
 * 设置在多个组件（阅读器主体、移动端设置抽屉）间共享，
 * 且需要在水合后无缝切换到 localStorage 中的用户偏好。
 */
let settingsCache: ReaderSettings | null = null;
const settingsListeners = new Set<() => void>();

function getSettingsSnapshot(): ReaderSettings {
  if (!settingsCache) settingsCache = getReaderSettings();
  return settingsCache;
}

export function useReaderSettings(): [ReaderSettings, (next: ReaderSettings) => void] {
  const settings = useSyncExternalStore(
    cb => {
      settingsListeners.add(cb);
      return () => settingsListeners.delete(cb);
    },
    getSettingsSnapshot,
    () => DEFAULT_READER_SETTINGS,
  );

  const update = useCallback((next: ReaderSettings) => {
    settingsCache = next;
    saveReaderSettings(next);
    settingsListeners.forEach(cb => cb());
  }, []);

  return [settings, update];
}
