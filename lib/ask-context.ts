'use client';

import { ReadingContext } from './agent/context';

/**
 * 阅读页 → 智能问道页的上下文交接。
 *
 * 为什么用 sessionStorage 而不是 URL 参数：阅读上下文可能包含
 * 数百字的选中原文，放进 URL 既不雅观也可能超长；sessionStorage
 * 随标签页生命周期存在，跳转即取、用完即弃，不产生持久数据。
 * 独立成模块：Reader 与 Ask 页共享同一交接协议，避免键名散落两处。
 */

const KEY = 'dz.ask-context.v1';

/** 阅读页跳转前调用：暂存当前阅读上下文 */
export function stashAskContext(reading: ReadingContext): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(reading));
  } catch {
    // 存储不可用时静默降级：问道页照常工作，只是没有阅读语境
  }
}

/** 问道页挂载时调用：取出并清除暂存的上下文（一次性消费） */
export function consumeAskContext(): ReadingContext | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as ReadingContext;
  } catch {
    return null;
  }
}
