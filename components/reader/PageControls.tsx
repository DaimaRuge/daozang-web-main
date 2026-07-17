'use client';

import { useState } from 'react';

/**
 * 书页翻页控制：左右按钮、页码输入、移动端滑动由父组件处理。
 */
export default function PageControls({
  pageIndex,
  totalPages,
  onPageChange,
  volumeTitle,
}: {
  pageIndex: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  volumeTitle?: string;
}) {
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState(false);

  const go = (next: number) => {
    if (next < 0 || next >= totalPages) return;
    onPageChange(next);
  };

  const submitJump = () => {
    const n = parseInt(input, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= totalPages) {
      onPageChange(n - 1);
    }
    setEditing(false);
    setInput('');
  };

  const btn =
    'px-3 py-2 text-sm border border-[var(--border)] rounded hover:bg-[var(--card-hover)] disabled:opacity-40 disabled:pointer-events-none transition-colors';

  return (
    <div
      className="sticky bottom-0 z-30 mt-8 py-4 px-3 bg-[var(--bg)]/95 backdrop-blur border border-[var(--border)] rounded-lg"
      role="navigation"
      aria-label="书页翻页"
    >
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={btn} onClick={() => go(pageIndex - 1)} disabled={pageIndex <= 0} aria-label="上一页">
          ‹ 上一页
        </button>

        <div className="flex flex-col items-center gap-0.5 min-w-[7rem]">
          {editing ? (
            <form
              className="flex items-center gap-1"
              onSubmit={e => {
                e.preventDefault();
                submitJump();
              }}
            >
              <input
                type="number"
                min={1}
                max={totalPages}
                value={input}
                onChange={e => setInput(e.target.value)}
                className="w-14 px-1 py-0.5 text-center text-sm border border-[var(--border)] rounded bg-[var(--card)]"
                autoFocus
                aria-label="跳转到页码"
              />
              <button type="submit" className="text-xs text-[var(--accent)]">跳转</button>
              <button type="button" className="text-xs text-[var(--muted)]" onClick={() => setEditing(false)}>取消</button>
            </form>
          ) : (
            <button
              type="button"
              className="text-sm tabular-nums hover:text-[var(--accent)]"
              onClick={() => {
                setInput(String(pageIndex + 1));
                setEditing(true);
              }}
              aria-label="输入页码跳转"
            >
              第 {pageIndex + 1} / {totalPages} 页
            </button>
          )}
          {volumeTitle && (
            <span className="text-[10px] text-[var(--muted)] truncate max-w-[12rem]">{volumeTitle}</span>
          )}
        </div>

        <button
          type="button"
          className={btn}
          onClick={() => go(pageIndex + 1)}
          disabled={pageIndex >= totalPages - 1}
          aria-label="下一页"
        >
          下一页 ›
        </button>
      </div>
    </div>
  );
}
