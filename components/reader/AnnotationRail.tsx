'use client';

import { RefObject, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { PublicAnnotation, relativeTime, reportContent, deleteAnnotation } from '@/lib/community';

/**
 * 桌面右侧旁注栏（marginalia）。
 *
 * 卡片按其锚定内容块的纵向位置对齐，尽量贴近原文；卡片过多时向下避让防重叠。
 * 与正文双向联动：hover 卡片高亮对应原文，点击滚动定位。
 * 仅桌面渲染；移动端旁注走行末徽章 + 底部抽屉（见 Reader）。
 */

const GAP = 12;

export default function AnnotationRail({
  annotations,
  articleRef,
  recomputeToken,
  currentUserId,
  onChanged,
  onToast,
}: {
  annotations: PublicAnnotation[];
  articleRef: RefObject<HTMLDivElement | null>;
  /** 变化即重算位置：翻页、字号、行高、宽度、旁注集合 */
  recomputeToken: string;
  currentUserId?: string;
  onChanged: () => void;
  onToast: (msg: string) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [tops, setTops] = useState<Record<string, number>>({});
  const [railHeight, setRailHeight] = useState(0);

  // 只保留当前页/视图中确有锚点块的旁注
  const anchored = annotations.filter(a => a.blockId);

  const highlightBlock = useCallback((blockId: string, on: boolean) => {
    const el = document.getElementById(blockId);
    if (el) el.classList.toggle('anno-target', on);
  }, []);

  const scrollToBlock = useCallback((blockId: string) => {
    const el = document.getElementById(blockId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('block-flash');
    setTimeout(() => el.classList.remove('block-flash'), 1600);
  }, []);

  /** 计算每张卡片的目标纵向位置：对齐锚定块顶部，重叠则向下避让 */
  useLayoutEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const articleTop = article.getBoundingClientRect().top;

    const raw = anchored
      .map(a => {
        const el = document.getElementById(a.blockId);
        if (!el) return null;
        return { id: a.id, top: el.getBoundingClientRect().top - articleTop };
      })
      .filter((x): x is { id: string; top: number } => x !== null)
      .sort((a, b) => a.top - b.top);

    const next: Record<string, number> = {};
    let cursor = 0;
    for (const item of raw) {
      const top = Math.max(item.top, cursor);
      next[item.id] = top;
      const h = cardRefs.current.get(item.id)?.offsetHeight ?? 96;
      cursor = top + h + GAP;
    }
    setTops(next);
    setRailHeight(Math.max(cursor, article.offsetHeight));
  }, [recomputeToken, anchored.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReport = async (id: string) => {
    try {
      await reportContent('annotation', id);
      onToast('已举报，感谢反馈');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '举报失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAnnotation(id);
      onToast('已删除');
      onChanged();
    } catch (e) {
      onToast(e instanceof Error ? e.message : '删除失败');
    }
  };

  if (anchored.length === 0) {
    return (
      <aside className="hidden xl:block w-60 shrink-0" aria-label="读者旁注">
        <div className="sticky top-8 text-xs text-[var(--muted)] leading-relaxed">
          <p className="tracking-wider mb-2">读者旁注</p>
          <p>划词写笔记并勾选「公开分享」，即可把心得留在原文旁，与其他读者共读。</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden xl:block w-60 shrink-0" aria-label="读者旁注">
      <div ref={railRef} className="relative" style={{ height: railHeight || undefined }}>
        {anchored.map(a => {
          const isOwner = currentUserId && a.authorUserId === currentUserId;
          return (
            <div
              key={a.id}
              ref={el => {
                if (el) cardRefs.current.set(a.id, el);
                else cardRefs.current.delete(a.id);
              }}
              className="anno-card absolute left-0 right-0"
              style={{ top: tops[a.id] ?? 0 }}
              onMouseEnter={() => highlightBlock(a.blockId, true)}
              onMouseLeave={() => highlightBlock(a.blockId, false)}
            >
              <button
                type="button"
                onClick={() => scrollToBlock(a.blockId)}
                className="block w-full text-left"
                aria-label="定位到原文"
              >
                <blockquote className="anno-card-quote">「{a.quote.slice(0, 40)}{a.quote.length > 40 ? '…' : ''}」</blockquote>
                <p className="anno-card-body">{a.body}</p>
              </button>
              <div className="flex items-center justify-between mt-2 text-[10px] text-[var(--muted)]">
                <span className="truncate">{a.authorName} · {relativeTime(a.createdAt)}</span>
                {isOwner ? (
                  <button onClick={() => handleDelete(a.id)} className="shrink-0 hover:text-[var(--cinnabar)]">删除</button>
                ) : (
                  <button onClick={() => handleReport(a.id)} className="shrink-0 hover:text-[var(--cinnabar)]" aria-label="举报">举报</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
