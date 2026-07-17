'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { TocItem } from '@/lib/content-schema';

interface TocTreeNode {
  item: TocItem;
  children: TocTreeNode[];
}

function buildTocTree(toc: TocItem[]): TocTreeNode[] {
  const roots: TocTreeNode[] = [];
  const stack: { node: TocTreeNode; level: number }[] = [];

  for (const item of toc) {
    const node: TocTreeNode = { item, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }
    stack.push({ node, level: item.level });
  }
  return roots;
}

function collectAncestorIds(node: TocTreeNode, targetId: string, path: string[] = []): string[] | null {
  const next = [...path, node.item.blockId];
  if (node.item.blockId === targetId) return next;
  for (const child of node.children) {
    const found = collectAncestorIds(child, targetId, next);
    if (found) return found;
  }
  return null;
}

function defaultExpanded(toc: TocItem[], activeId?: string | null): Set<string> {
  const expanded = new Set<string>();
  if (!activeId) {
    toc.filter(t => t.level <= 2).forEach(t => expanded.add(t.blockId));
    return expanded;
  }
  const tree = buildTocTree(toc);
  for (const root of tree) {
    const path = collectAncestorIds(root, activeId);
    if (path) {
      path.slice(0, -1).forEach(id => expanded.add(id));
      break;
    }
  }
  toc.filter(t => t.level <= 2).forEach(t => expanded.add(t.blockId));
  return expanded;
}

/**
 * 典籍内部目录面板（树形）。
 * 标题点击 → 跳转正文；箭头 → 仅展开/折叠子目录。
 */
export default function TocPanel({
  toc,
  activeId,
  onNavigateToBlock,
  onNavigate,
}: {
  toc: TocItem[];
  activeId?: string | null;
  onNavigateToBlock: (blockId: string) => void;
  onNavigate?: () => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!activeId || !listRef.current) return;
    listRef.current
      .querySelector(`[data-toc-id="${activeId}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const tree = useMemo(() => buildTocTree(toc), [toc]);
  const [expanded, setExpanded] = useState<Set<string>>(() => defaultExpanded(toc, activeId));

  useEffect(() => {
    if (!activeId) return;
    setExpanded(prev => {
      const next = new Set(prev);
      const path = tree.flatMap(root => collectAncestorIds(root, activeId) ?? []);
      path.slice(0, -1).forEach(id => next.add(id));
      return next;
    });
  }, [activeId, tree]);

  const toggleExpand = (blockId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  };

  const jumpTo = (blockId: string) => {
    onNavigateToBlock(blockId);
    onNavigate?.();
  };

  const renderNode = (node: TocTreeNode, depth = 0) => {
    const { item, children } = node;
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(item.blockId);
    const isActive = item.blockId === activeId;
    const indent = depth === 0 ? '' : depth === 1 ? 'pl-2' : 'pl-5';

    return (
      <li key={item.blockId}>
        <div className={`flex items-stretch gap-0.5 ${indent}`}>
          {hasChildren ? (
            <button
              type="button"
              aria-label={isExpanded ? '折叠' : '展开'}
              aria-expanded={isExpanded}
              onClick={e => toggleExpand(item.blockId, e)}
              className="shrink-0 w-6 flex items-center justify-center text-[var(--muted)] hover:text-[var(--accent)]"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          ) : (
            <span className="w-6 shrink-0" aria-hidden />
          )}
          <button
            type="button"
            data-toc-id={item.blockId}
            onClick={() => jumpTo(item.blockId)}
            aria-current={isActive ? 'location' : undefined}
            className={`flex-1 text-left py-1.5 rounded transition-colors hover:text-[var(--accent)] ${
              item.level <= 1 ? 'font-semibold text-sm' : item.level === 2 ? 'text-sm' : 'text-xs'
            } ${
              isActive
                ? 'text-[var(--accent)] font-medium bg-[var(--card-hover)]'
                : item.level >= 3
                  ? 'text-[var(--muted)]'
                  : 'text-[var(--text-secondary)]'
            }`}
          >
            <span className="line-clamp-2">{item.title}</span>
          </button>
        </div>
        {hasChildren && isExpanded && (
          <ul className="space-y-0.5 mt-0.5">{children.map(child => renderNode(child, depth + 1))}</ul>
        )}
      </li>
    );
  };

  if (toc.length === 0) {
    return <p className="text-xs text-[var(--muted)] px-2 py-4">本篇未识别出目录结构</p>;
  }

  return (
    <nav aria-label="典籍目录" className="text-sm">
      <ul className="space-y-0.5" ref={listRef}>
        {tree.map(node => renderNode(node))}
      </ul>
    </nav>
  );
}
