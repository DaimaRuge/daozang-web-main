'use client';

import { useCallback, useEffect, useState } from 'react';
import { mediaUrl } from '@/lib/media-url';

interface QueueItem {
  kind: 'annotation' | 'comment' | 'contribution';
  id: string;
  book_id: string;
  body: string;
  quote: string | null;
  author_user_id: string;
  author_name: string | null;
  status: string;
  report_count: number;
  created_at: number;
}

type KindFilter = 'all' | 'annotation' | 'comment' | 'contribution';

function kindLabel(item: QueueItem): string {
  if (item.kind === 'annotation') return '旁注';
  if (item.kind === 'comment') return '评论';
  if (item.book_id === 'image') return '投稿·图';
  if (item.book_id === 'audio') return '投稿·音';
  if (item.book_id === 'book') return '投稿·书';
  return '投稿';
}

export default function QueueClient() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [kind, setKind] = useState<KindFilter>('all');
  const [status, setStatus] = useState<'queue' | 'hidden' | 'pending'>('queue');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ kind });
    if (status !== 'queue') params.set('status', status);
    try {
      const res = await fetch(`/api/studio/moderation?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [kind, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (item: QueueItem, verdict: 'approve' | 'reject') => {
    setBusyId(item.id);
    setError('');
    try {
      const res = await fetch('/api/studio/moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: item.kind, id: item.id, verdict }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失败');
      setItems(prev => prev.filter(x => x.id !== item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBusyId(null);
    }
  };

  const banAuthor = async (item: QueueItem) => {
    if (!confirm(`确认封禁 ${item.author_name || item.author_user_id}？该账号将无法登录。`)) return;
    setBusyId(item.id);
    setError('');
    try {
      const res = await fetch(`/api/studio/users/${item.author_user_id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'banned' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '封禁失败');
    } catch (err) {
      setError(err instanceof Error ? err.message : '封禁失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        {([
          ['all', '全部'],
          ['annotation', '旁注'],
          ['comment', '评论'],
          ['contribution', '投稿'],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`px-3 py-1 rounded border ${
              kind === k
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--muted)]'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="w-px bg-[var(--border)] mx-1" />
        {([
          ['queue', '待处理'],
          ['hidden', '已隐藏'],
          ['pending', '待审'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={`px-3 py-1 rounded border ${
              status === value
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--muted)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-[var(--cinnabar)]">{error}</p>}
      {loading && <p className="text-sm text-[var(--muted)]">加载中…</p>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-[var(--muted)]">队列为空。</p>
      )}

      <ul className="space-y-4">
        {items.map(item => (
          <li key={`${item.kind}:${item.id}`} className="border border-[var(--border)] rounded-lg p-4 bg-[var(--card)] space-y-2">
            <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
              <span>{kindLabel(item)}</span>
              <span>{item.status}</span>
              {item.kind !== 'contribution' && <span>举报 {item.report_count}</span>}
              {item.kind !== 'contribution' && <span>书 {item.book_id}</span>}
              <span>{item.author_name || '匿名道友'}</span>
            </div>
            {item.kind === 'contribution' && item.quote && item.book_id === 'image' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(item.quote)} alt="" className="max-h-48 rounded" />
            )}
            {item.kind === 'contribution' && item.quote && item.book_id === 'audio' && (
              <audio controls src={mediaUrl(item.quote)} className="w-full" />
            )}
            {item.kind !== 'contribution' && item.quote && (
              <p className="text-xs text-[var(--muted)] border-l-2 border-[var(--border)] pl-2">
                「{item.quote}」
              </p>
            )}
            <p className="text-sm whitespace-pre-wrap">{item.body}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={busyId === item.id}
                onClick={() => void decide(item, 'approve')}
                className="text-xs px-3 py-1 rounded border border-[var(--accent)] text-[var(--accent)] disabled:opacity-50"
              >
                通过
              </button>
              <button
                type="button"
                disabled={busyId === item.id}
                onClick={() => void decide(item, 'reject')}
                className="text-xs px-3 py-1 rounded border border-[var(--border)] text-[var(--muted)] disabled:opacity-50"
              >
                驳回
              </button>
              <button
                type="button"
                disabled={busyId === item.id}
                onClick={() => void banAuthor(item)}
                className="text-xs px-3 py-1 rounded border border-[var(--cinnabar)] text-[var(--cinnabar)] disabled:opacity-50"
              >
                封禁作者
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
