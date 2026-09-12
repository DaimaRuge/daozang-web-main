'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ReadingProgress,
  Bookmark,
  Note,
  getRecentReading,
  getBookmarks,
  getNotes,
  removeBookmark,
  removeNote,
} from '@/lib/user-data';
import { useLocalData } from '@/lib/use-local-data';

/** SSR 快照用的稳定空数组 */
const EMPTY_RECENT: ReadingProgress[] = [];
const EMPTY_BOOKMARKS: Bookmark[] = [];
const EMPTY_NOTES: Note[] = [];

/**
 * 我的书房（客户端页面）。
 *
 * 为什么是纯客户端组件：最近阅读、收藏、笔记当前都存于用户本地
 * （localStorage），服务端没有这些数据；未来接入账号体系后，
 * 数据来源切换到服务端 API，本页面的 UI 结构可以完全保留。
 * 三个标签页共用一套列表容器，各自的数据模型来自 lib/user-data。
 */

type Tab = 'recent' | 'bookmarks' | 'notes';

export default function LibraryPage() {
  const [tab, setTab] = useState<Tab>('recent');
  // localStorage 数据通过水合安全的 useLocalData 读取（SSR 阶段为空态）
  const [recent] = useLocalData(() => getRecentReading(20), EMPTY_RECENT);
  const [bookmarks, refreshBookmarks] = useLocalData(getBookmarks, EMPTY_BOOKMARKS);
  const [notes, refreshNotes] = useLocalData(getNotes, EMPTY_NOTES);

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: 'recent', label: '最近阅读', count: recent.length },
    { key: 'bookmarks', label: '收藏', count: bookmarks.length },
    { key: 'notes', label: '笔记', count: notes.length },
  ];

  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const empty = (msg: string) => (
    <div className="text-center py-16 text-sm text-[var(--muted)]">
      <p className="mb-3">{msg}</p>
      <Link href="/catalog" className="text-[var(--accent)] hover:underline text-xs">去经文目录逛逛 →</Link>
    </div>
  );

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-serif tracking-wider mb-2">我的书房</h1>
      <p className="text-xs text-[var(--muted)] mb-8">数据保存在您的浏览器本地，不会上传到服务器。</p>

      {/* 标签切换 */}
      <div className="flex gap-1 border-b border-[var(--border)] mb-6" role="tablist">
        {tabs.map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {t.label}{t.count > 0 && <span className="text-xs ml-1 opacity-60">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* 最近阅读 */}
      {tab === 'recent' && (
        recent.length === 0 ? empty('还没有阅读记录') : (
          <div className="space-y-1">
            {recent.map(r => (
              <Link
                key={r.bookId}
                href={`/text/${r.bookId}`}
                className="block px-4 py-3 rounded-lg hover:bg-[var(--card)] transition-colors group"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm group-hover:text-[var(--accent)] transition-colors truncate">{r.bookTitle}</div>
                    <div className="text-xs text-[var(--muted)] mt-0.5">{r.category} · {fmtTime(r.updatedAt)}</div>
                  </div>
                  <div className="shrink-0 text-xs text-[var(--muted)]">
                    已读 {Math.round(r.scrollProgress * 100)}%
                  </div>
                </div>
                {/* 进度条：直观呈现每本书读到哪里 */}
                <div className="mt-2 h-1 bg-[var(--border)] rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--accent-light)]" style={{ width: `${r.scrollProgress * 100}%` }} />
                </div>
              </Link>
            ))}
          </div>
        )
      )}

      {/* 收藏 */}
      {tab === 'bookmarks' && (
        bookmarks.length === 0 ? empty('还没有收藏内容，阅读时选中文字即可收藏段落') : (
          <div className="space-y-1">
            {bookmarks.map(b => (
              <div key={b.id} className="px-4 py-3 rounded-lg hover:bg-[var(--card)] transition-colors group">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/text/${b.bookId}${b.blockId ? `#${b.blockId}` : ''}`} className="min-w-0 flex-1">
                    <div className="text-sm group-hover:text-[var(--accent)] transition-colors">{b.bookTitle}</div>
                    {b.excerpt && (
                      <blockquote className="text-xs text-[var(--text-secondary)] mt-1.5 border-l-2 border-[var(--accent-light)] pl-2 line-clamp-2">
                        {b.excerpt}
                      </blockquote>
                    )}
                    <div className="text-xs text-[var(--muted)] mt-1">{fmtTime(b.createdAt)}</div>
                  </Link>
                  <button
                    onClick={() => { removeBookmark(b.id); refreshBookmarks(); }}
                    className="text-xs text-[var(--muted)] hover:text-[var(--cinnabar)] transition-colors shrink-0"
                    aria-label="删除收藏"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* 笔记 */}
      {tab === 'notes' && (
        notes.length === 0 ? empty('还没有笔记，阅读时选中文字即可记录想法') : (
          <div className="space-y-3">
            {notes.map(n => (
              <div key={n.id} className="p-4 bg-[var(--card)] border border-[var(--border)] rounded-lg">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <Link
                    href={`/text/${n.bookId}${n.blockId ? `#${n.blockId}` : ''}`}
                    className="text-sm text-[var(--accent)] hover:opacity-70 transition-opacity"
                  >
                    {n.bookTitle}
                  </Link>
                  <button
                    onClick={() => { removeNote(n.id); refreshNotes(); }}
                    className="text-xs text-[var(--muted)] hover:text-[var(--cinnabar)] transition-colors shrink-0"
                    aria-label="删除笔记"
                  >
                    删除
                  </button>
                </div>
                {/* 原文摘录与用户笔记分区呈现：内容边界原则 */}
                <blockquote className="text-xs text-[var(--text-secondary)] border-l-2 border-[var(--accent-light)] pl-2 mb-2 line-clamp-3">
                  {n.sourceText}
                </blockquote>
                <p className="text-sm whitespace-pre-wrap">{n.noteText}</p>
                <div className="text-xs text-[var(--muted)] mt-2">{fmtTime(n.createdAt)}</div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
