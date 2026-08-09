'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  PublicComment,
  fetchComments,
  postComment,
  deleteComment,
  reportContent,
  relativeTime,
} from '@/lib/community';
import { UGC_LIMITS } from '@/lib/ugc';

/**
 * 全文评论区（篇级讨论）。放正文末尾、相邻篇目之前，默认折叠显示数量。
 * 公开可读，登录后可发布；作者可删除自己的评论，其他人可举报。
 */
export default function CommentSection({ bookId, onToast }: { bookId: string; onToast: (m: string) => void }) {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchComments(bookId)
      .then(list => { if (alive) { setComments(list); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [bookId]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    try {
      const created = await postComment(bookId, body);
      setComments(prev => [created, ...prev]);
      setDraft('');
      onToast('评论已发布');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '发布失败');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteComment(id);
      setComments(prev => prev.filter(c => c.id !== id));
      onToast('已删除');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '删除失败');
    }
  };

  const report = async (id: string) => {
    try {
      await reportContent('comment', id);
      onToast('已举报，感谢反馈');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '举报失败');
    }
  };

  return (
    <section className="mt-12 pt-6 border-t border-[var(--border)]" aria-label="全文评论">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-sm font-serif tracking-wider text-[var(--text)] hover:text-[var(--accent)] transition-colors"
        aria-expanded={open}
      >
        <span>读者评论</span>
        <span className="text-xs text-[var(--muted)]">{loaded ? comments.length : '…'}</span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="mt-5 animate-fade-in">
          {/* 发布框 */}
          {userId ? (
            <div className="mb-6">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value.slice(0, UGC_LIMITS.commentMaxLen))}
                placeholder="分享你对本篇的理解或疑问…（请友善交流）"
                rows={3}
                className="w-full text-sm bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 focus:outline-none focus:border-[var(--accent)] transition-colors resize-none"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-[var(--muted)]">{draft.length}/{UGC_LIMITS.commentMaxLen}</span>
                <button
                  onClick={submit}
                  disabled={!draft.trim() || submitting}
                  className="px-5 py-1.5 text-xs rounded-full bg-[var(--accent)] text-white hover:bg-[var(--accent-light)] transition-colors disabled:opacity-40"
                >
                  {submitting ? '发布中…' : '发布评论'}
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-6 px-4 py-3 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs text-[var(--muted)]">
              <Link href="/login" className="text-[var(--accent)] hover:underline">登录</Link> 后可参与评论。
            </div>
          )}

          {/* 列表 */}
          {loaded && comments.length === 0 && (
            <p className="text-sm text-[var(--muted)] text-center py-8">还没有评论，来做第一个分享心得的人。</p>
          )}
          <ul className="space-y-4">
            {comments.map(c => (
              <li key={c.id} className="flex gap-3">
                <span className="shrink-0 w-8 h-8 rounded-full bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-xs text-[var(--muted)] font-serif">
                  {c.authorName.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)] mb-1">
                    <span className="text-[var(--text-secondary)]">{c.authorName}</span>
                    <span>{relativeTime(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap break-words">{c.body}</p>
                  <div className="mt-1 text-[10px] text-[var(--muted)]">
                    {userId && c.authorUserId === userId ? (
                      <button onClick={() => remove(c.id)} className="hover:text-[var(--cinnabar)]">删除</button>
                    ) : userId ? (
                      <button onClick={() => report(c.id)} className="hover:text-[var(--cinnabar)]">举报</button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
