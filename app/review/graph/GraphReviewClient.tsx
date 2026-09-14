'use client';

import { useState } from 'react';
import Link from 'next/link';
import { EDGE_SOURCE_LABELS, NODE_ORIGIN_LABELS, NODE_TYPE_LABELS } from '@/lib/graph/schema';
import type { GraphNodeOrigin, GraphNodeType } from '@/lib/graph/schema';
import type { GraphEdgeDecision, GraphReviewItem } from '@/lib/graph/override-schema';

/**
 * 图谱边审核操作区。服务端负责队列与稳定键，这里只提交确认/否决/撤销。
 * 保存成功后本地更新 decision，避免整页刷新把筛选状态冲掉。
 */

function originLabel(origin?: string): string | null {
  if (!origin || origin === 'catalog') return null;
  return NODE_ORIGIN_LABELS[origin as GraphNodeOrigin] ?? origin;
}

function typeLabel(type: string): string {
  return NODE_TYPE_LABELS[type as GraphNodeType] ?? type;
}

function NodeChip({ id, label, type, origin }: {
  id: string;
  label: string;
  type: string;
  origin?: string;
}) {
  const originText = originLabel(origin);
  return (
    <Link href={`/graph?id=${encodeURIComponent(id)}`} className="text-[var(--accent)] hover:underline">
      {label}
      <span className="text-[var(--muted)] font-sans font-normal">
        {' '}({typeLabel(type)}{originText ? ` · ${originText}` : ''})
      </span>
    </Link>
  );
}

export default function GraphReviewClient({ items }: { items: GraphReviewItem[] }) {
  const [decisions, setDecisions] = useState<Record<string, GraphEdgeDecision | null>>(
    () => Object.fromEntries(items.map(it => [it.key, it.decision])),
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const save = async (target: string | string[], decision: GraphEdgeDecision | null) => {
    const keys = Array.isArray(target) ? target : [target];
    if (keys.length === 0) return;
    setSaving(Array.isArray(target) ? 'batch' : keys[0]);
    setError('');
    try {
      const res = await fetch('/api/review/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keys,
          decision,
          remove: decision === null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `保存失败（${res.status}）`);
      }
      setDecisions(prev => {
        const next = { ...prev };
        for (const key of keys) next[key] = decision;
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(null);
    }
  };

  const pendingKeys = items.filter(it => (decisions[it.key] ?? it.decision) == null).map(it => it.key);

  if (items.length === 0) {
    return <p className="text-sm text-[var(--muted)] py-8">这一栏没有待处理的关系。</p>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-xs text-[var(--cinnabar)] bg-[var(--card)] border border-[var(--border)] rounded px-3 py-2">{error}</p>
      )}

      {pendingKeys.length > 1 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => save(pendingKeys, 'confirm')}
            disabled={saving !== null}
            className="px-2.5 py-1 rounded border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--card-hover)] disabled:opacity-40"
          >
            确认本页未审 {pendingKeys.length} 条
          </button>
          <button
            type="button"
            onClick={() => save(pendingKeys, 'reject')}
            disabled={saving !== null}
            className="px-2.5 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--cinnabar)] disabled:opacity-40"
          >
            否决本页未审
          </button>
        </div>
      )}

      {items.map(item => {
        const current = decisions[item.key] ?? null;
        return (
          <div key={item.key} className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
            <p className="text-sm font-serif leading-relaxed">
              <NodeChip id={item.fromId} label={item.fromLabel} type={item.fromType} origin={item.fromOrigin} />
              <span className="text-[var(--muted)] mx-2">{item.typeLabel}</span>
              <NodeChip id={item.toId} label={item.toLabel} type={item.toType} origin={item.toOrigin} />
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-[var(--muted)]">
              <span>{EDGE_SOURCE_LABELS[item.source]}</span>
              <span>置信度 {item.confidence.toFixed(2)}</span>
              {item.weight != null && <span>权重 {item.weight}</span>}
              {current === 'confirm' && <span className="text-[var(--accent)]">已确认为人工审定</span>}
              {current === 'reject' && <span className="text-[var(--cinnabar)]">已否决（图中不再显示）</span>}
            </div>
            {item.quote && (
              <p className="text-xs text-[var(--muted)] mt-2 font-serif">「{item.quote}」</p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {current !== 'confirm' && (
                <button
                  type="button"
                  onClick={() => save(item.key, 'confirm')}
                  disabled={saving === item.key}
                  className="px-2.5 py-1 text-xs rounded border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--card-hover)] disabled:opacity-40"
                >
                  确认此关联
                </button>
              )}
              {current !== 'reject' && (
                <button
                  type="button"
                  onClick={() => save(item.key, 'reject')}
                  disabled={saving === item.key}
                  className="px-2.5 py-1 text-xs rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--cinnabar)] disabled:opacity-40"
                >
                  否决
                </button>
              )}
              {current && (
                <button
                  type="button"
                  onClick={() => save(item.key, null)}
                  disabled={saving === item.key}
                  className="px-2.5 py-1 text-xs rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40"
                >
                  撤销校正
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
