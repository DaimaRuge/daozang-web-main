'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { trackEvent } from '@/lib/user-data';

/**
 * AI 插图面板：划词/段落「生成插图」的结果展示与轮询。
 */
export default function IllustrationPanel({
  bookId,
  blockId,
  sourceText,
  onClose,
}: {
  bookId: string;
  blockId?: string;
  sourceText: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading');
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    trackEvent('illustration_generate', { bookId, blockId });

    fetch('/api/illustrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookId,
        blockId: blockId ?? 'selection',
        text: sourceText,
        type: 'scene',
      }),
      signal: controller.signal,
    })
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || '创建任务失败');
        if (data.status === 'done' && data.imageUrl) {
          setImageUrl(data.imageUrl);
          setState('done');
          trackEvent('illustration_view', { bookId, blockId });
          return null;
        }
        return data.jobId as string;
      })
      .then(jobId => {
        if (!jobId || controller.signal.aborted) return;

        const poll = async () => {
          for (let i = 0; i < 120 && !controller.signal.aborted; i++) {
            await new Promise(r => setTimeout(r, 3000));
            const res = await fetch(`/api/illustrations?jobId=${encodeURIComponent(jobId)}`, {
              signal: controller.signal,
            });
            const st = await res.json();
            if (st.status === 'done' && st.imageUrl) {
              setImageUrl(st.imageUrl);
              setState('done');
              trackEvent('illustration_view', { bookId, blockId });
              return;
            }
            if (st.status === 'failed') {
              throw new Error(st.error || '插图生成失败');
            }
          }
          throw new Error('生成超时，请稍后重试');
        };
        return poll();
      })
      .catch(e => {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : '生成失败');
          setState('error');
        }
      });

    return () => controller.abort();
  }, [bookId, blockId, sourceText]);

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center lg:p-4 bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-label="AI 插图"
        className="w-full lg:max-w-lg max-h-[85vh] overflow-y-auto bg-[var(--card)] border border-[var(--border)] rounded-t-xl lg:rounded-lg shadow-[var(--shadow-soft)] p-5 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">
            <span className="text-[var(--cinnabar)] mr-1.5">插图</span>
            <span className="text-xs font-normal text-[var(--muted)]">AI 生成 · 仅供参考</span>
          </h3>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)] p-1" aria-label="关闭">✕</button>
        </div>

        <blockquote className="text-xs text-[var(--text-secondary)] bg-[var(--bg)] border-l-2 border-[var(--accent-light)] rounded px-3 py-2 mb-4 max-h-24 overflow-y-auto">
          {sourceText}
        </blockquote>

        {state === 'loading' && (
          <div className="py-8 text-center text-sm text-[var(--muted)]" aria-live="polite">
            <div className="w-full aspect-[4/3] bg-[var(--border)] rounded-lg animate-pulse mb-3" />
            正在生成水墨插图，约需 1–2 分钟…
          </div>
        )}

        {state === 'done' && imageUrl && (
          <figure>
            <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--bg)]">
              <Image src={imageUrl} alt="AI 生成插图" fill sizes="(max-width:768px) 100vw, 512px" className="object-contain" />
            </div>
          </figure>
        )}

        {state === 'error' && (
          <p className="text-sm text-[var(--muted)] py-4">{error}</p>
        )}

        <p className="text-xs text-[var(--muted)] mt-4 pt-3 border-t border-[var(--border)]">
          插图为 AI 生成意境图，非史料图证，请以原文与权威注疏为准。
        </p>
      </div>
    </div>
  );
}
