'use client';

import { useSyncExternalStore } from 'react';

/**
 * 窄屏（手机）判定 Hook。
 *
 * 为什么图谱需要知道视口宽度：SVG 用 viewBox 等比缩放，同一份坐标在
 * 900 宽的画布上是 11px 的中文标签，缩到 390px 的手机上就只剩 4px ——
 * 结构还在，字已经看不清了。故窄屏改用更小的画布尺寸与更少的节点数，
 * 让缩放比接近 1:1。这是布局参数的选择，不是样式覆盖，因此必须进 JS。
 *
 * 为什么用 useSyncExternalStore 而不是 useEffect + setState：
 * 与 lib/use-local-data.ts 同一理由 —— 在 effect 里同步 setState 会触发
 * 级联渲染（react-hooks/set-state-in-effect）。服务端快照返回 false，
 * 即默认按宽屏渲染，客户端水合后按真实视口纠正。
 */

const QUERY = '(max-width: 767px)';

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

/** 服务端快照恒为 false：布尔值是稳定引用，不会导致无限重渲染 */
function getServerSnapshot(): boolean {
  return false;
}

export function useNarrowViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
