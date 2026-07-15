'use client';

import { useState } from 'react';

/**
 * 笔记编辑弹层。
 *
 * 为什么拆成独立组件：笔记是「原文摘录（只读） + 用户想法（可编辑）」的
 * 双区结构，这一形态未来在书房页编辑笔记时同样复用；
 * 原文摘录区刻意做成只读展示，从交互上保证用户笔记不会覆盖原文。
 */
export default function NoteDialog({
  sourceText,
  onSave,
  onClose,
}: {
  sourceText: string;
  onSave: (noteText: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-label="添加笔记"
        className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-[var(--shadow-soft)] p-5 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-3">添加笔记</h3>

        {/* 原文摘录：只读，与用户笔记分区呈现 */}
        <blockquote className="text-xs text-[var(--text-secondary)] bg-[var(--bg)] border-l-2 border-[var(--accent-light)] rounded px-3 py-2 mb-3 max-h-24 overflow-y-auto">
          {sourceText}
        </blockquote>

        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="写下你的想法…"
          rows={4}
          className="w-full text-sm bg-[var(--bg)] border border-[var(--border)] rounded p-3 focus:outline-none focus:border-[var(--accent)] transition-colors resize-none"
        />

        <div className="flex justify-end gap-2 mt-3">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs border border-[var(--border)] rounded hover:bg-[var(--card-hover)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => text.trim() && onSave(text.trim())}
            disabled={!text.trim()}
            className="px-4 py-1.5 text-xs rounded bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
