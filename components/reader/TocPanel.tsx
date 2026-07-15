'use client';

import { useEffect, useRef } from 'react';
import { TocItem } from '@/lib/content-schema';

/**
 * 典籍内部目录面板。
 *
 * 为什么拆成独立组件：桌面端作为左侧栏、移动端作为底部抽屉复用同一份目录，
 * 只是容器不同；目录数据来自解析器的 toc（标题类块），与渲染层解耦。
 * 当前章追踪由父组件（Reader）基于滚动位置计算后经 activeId 传入 ——
 * 面板自身保持无滚动监听，避免多个实例（侧栏+抽屉）重复监听。
 */
export default function TocPanel({
  toc,
  activeId,
  onNavigate,
}: {
  toc: TocItem[];
  /** 当前阅读位置所在的目录项（高亮显示） */
  activeId?: string | null;
  /** 点击目录项后回调（移动端用于收起抽屉） */
  onNavigate?: () => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  // 当前章变化时让高亮项保持在目录可视区内（nearest 避免大幅滚动打扰）
  useEffect(() => {
    if (!activeId || !listRef.current) return;
    listRef.current
      .querySelector(`[data-toc-id="${activeId}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const scrollTo = (blockId: string) => {
    document.getElementById(blockId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    onNavigate?.();
  };

  if (toc.length === 0) {
    return <p className="text-xs text-[var(--muted)] px-2 py-4">本篇未识别出目录结构</p>;
  }

  return (
    <nav aria-label="典籍目录" className="text-sm">
      <ul className="space-y-0.5" ref={listRef}>
        {toc.map(item => {
          const isActive = item.blockId === activeId;
          const indent =
            item.level <= 1 ? 'font-semibold' : item.level === 2 ? 'pl-2' : 'pl-5 text-xs';
          return (
            <li key={item.blockId}>
              <button
                data-toc-id={item.blockId}
                onClick={() => scrollTo(item.blockId)}
                aria-current={isActive ? 'location' : undefined}
                className={`block w-full text-left py-1.5 rounded transition-colors hover:text-[var(--accent)] ${indent} ${
                  isActive
                    ? 'text-[var(--accent)] font-medium bg-[var(--card-hover)]'
                    : item.level >= 3
                      ? 'text-[var(--muted)]'
                      : 'text-[var(--text-secondary)]'
                }`}
              >
                <span className="line-clamp-1">{item.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
