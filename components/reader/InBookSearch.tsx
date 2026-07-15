'use client';

import { useMemo, useState } from 'react';
import { ContentBlock } from '@/lib/content-schema';
import { trackEvent } from '@/lib/user-data';

/**
 * 书内搜索：在当前典籍的内容块中查找关键词并定位。
 *
 * 为什么基于 ContentBlock 而不是原始文本：命中结果直接持有 blockId，
 * 点击即可精确滚动定位并闪烁提示 —— 这是结构化数据模型带来的直接收益。
 * 组件放在目录面板区域（桌面侧栏 / 移动抽屉共用），与站级全文搜索互补。
 */
export default function InBookSearch({
  blocks,
  onNavigate,
}: {
  blocks: ContentBlock[];
  /** 定位后回调（移动端用于收起抽屉） */
  onNavigate?: () => void;
}) {
  const [query, setQuery] = useState('');

  const hits = useMemo(() => {
    const q = query.trim();
    if (q.length < 1) return [];
    const results: Array<{ blockId: string; snippet: string }> = [];
    for (const b of blocks) {
      const pos = b.content.indexOf(q);
      if (pos === -1) continue;
      const start = Math.max(0, pos - 12);
      const end = Math.min(b.content.length, pos + q.length + 20);
      results.push({
        blockId: b.id,
        snippet: (start > 0 ? '…' : '') + b.content.slice(start, end) + (end < b.content.length ? '…' : ''),
      });
      if (results.length >= 50) break; // 结果上限，避免长书全命中时列表爆炸
    }
    return results;
  }, [blocks, query]);

  const locate = (blockId: string) => {
    const el = document.getElementById(blockId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // 定位后短暂高亮目标块，帮助视线锁定
    el.classList.add('block-flash');
    setTimeout(() => el.classList.remove('block-flash'), 1600);
    trackEvent('search', { scope: 'in-book' });
    onNavigate?.();
  };

  return (
    <div className="mb-4">
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="书内搜索…"
        aria-label="书内搜索"
        className="w-full px-3 py-1.5 text-xs bg-[var(--bg)] border border-[var(--border)] rounded focus:outline-none focus:border-[var(--accent)] transition-colors"
      />
      {query.trim() && (
        <div className="mt-2 max-h-48 overflow-y-auto space-y-0.5">
          {hits.length === 0 && (
            <p className="text-xs text-[var(--muted)] px-1 py-2">无匹配内容</p>
          )}
          {hits.map(h => (
            <button
              key={h.blockId}
              onClick={() => locate(h.blockId)}
              className="block w-full text-left px-1.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--card-hover)] rounded transition-colors"
            >
              <span className="line-clamp-2">{h.snippet}</span>
            </button>
          ))}
          {hits.length >= 50 && (
            <p className="text-xs text-[var(--muted)] px-1 py-1">仅显示前 50 条</p>
          )}
        </div>
      )}
    </div>
  );
}
