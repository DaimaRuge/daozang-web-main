'use client';

import { useState } from 'react';
import { ContentBlockType } from '@/lib/content-schema';

/**
 * 审核操作区（客户端）：逐块展示低置信度内容，提供改判/确认/撤销操作。
 * 服务端页面负责取数与稳定键计算，本组件只管交互与调用保存 API。
 */

export interface ReviewItem {
  /** 持久稳定键（原文行号 + 内容前缀），解析规则升级不漂移 */
  key: string;
  blockId: string;
  content: string;
  ruleType: ContentBlockType;
  ruleLevel?: number;
  confidence: number;
  /** 已有的人工校正（null 表示未校正） */
  override: { type: ContentBlockType; level?: number } | null;
  prevContent: string;
  nextContent: string;
}

/** 改判选项：覆盖低置信度块的常见实际类型 */
const TYPE_OPTIONS: Array<{ label: string; type: ContentBlockType; level?: number }> = [
  { label: '正文段落', type: 'paragraph' },
  { label: '篇/品名（进目录）', type: 'subheading', level: 3 },
  { label: '小节标签（不进目录）', type: 'subheading', level: 4 },
  { label: '卷标题', type: 'heading', level: 2 },
  { label: '韵文/偈颂', type: 'verse' },
  { label: '科仪指示', type: 'annotation' },
  { label: '注疏', type: 'commentary' },
  { label: '原书说明', type: 'original-note' },
];

const TYPE_LABEL: Partial<Record<ContentBlockType, string>> = {
  paragraph: '正文段落',
  subheading: '小标题',
  heading: '标题',
  verse: '韵文',
  annotation: '指示语',
  commentary: '注疏',
  'original-note': '原书说明',
  quote: '引文',
  separator: '分隔',
};

export default function ReviewClient({ bookId, items }: { bookId: string; items: ReviewItem[] }) {
  // 本地维护每块的校正状态：保存成功即更新，无需整页刷新
  const [overrides, setOverrides] = useState<Record<string, { type: ContentBlockType; level?: number } | null>>(
    () => Object.fromEntries(items.map(it => [it.key, it.override])),
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const save = async (key: string, payload: { type?: ContentBlockType; level?: number; remove?: boolean }) => {
    setSaving(key);
    setError('');
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, key, ...payload }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `保存失败（${res.status}）`);
      }
      setOverrides(prev => ({
        ...prev,
        [key]: payload.remove ? null : { type: payload.type!, level: payload.level },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(null);
    }
  };

  if (items.length === 0) {
    return <p className="text-sm text-[var(--muted)] py-8">这部典籍没有待审核的低置信度块。</p>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-xs text-[var(--cinnabar)] bg-[var(--card)] border border-[var(--border)] rounded px-3 py-2">{error}</p>
      )}

      {items.map(item => {
        const current = overrides[item.key];
        return (
          <div key={item.key} className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
            {/* 语境：前后块内容帮助人工判断 */}
            {item.prevContent && (
              <p className="text-xs text-[var(--muted)] truncate mb-1">… {item.prevContent}</p>
            )}
            <p className="text-sm font-serif leading-relaxed my-1.5">{item.content}</p>
            {item.nextContent && (
              <p className="text-xs text-[var(--muted)] truncate mt-1">{item.nextContent} …</p>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-xs">
              <span className="text-[var(--muted)]">
                规则判定：{TYPE_LABEL[item.ruleType] ?? item.ruleType}
                {item.ruleLevel ? ` L${item.ruleLevel}` : ''}（置信度 {item.confidence.toFixed(2)}）
              </span>
              {current && (
                <span className="text-[var(--accent)]">
                  已校正为：{TYPE_LABEL[current.type] ?? current.type}
                  {current.level ? ` L${current.level}` : ''}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 mt-3">
              {/* 确认规则判定无误：以规则结果落为人工校正，置信度记满 */}
              {!current && (
                <button
                  onClick={() => save(item.key, { type: item.ruleType, level: item.ruleLevel })}
                  disabled={saving === item.key}
                  className="px-2.5 py-1 text-xs rounded border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--card-hover)] disabled:opacity-40"
                >
                  确认无误
                </button>
              )}
              {TYPE_OPTIONS.filter(o => !(o.type === item.ruleType && o.level === item.ruleLevel)).map(o => (
                <button
                  key={`${o.type}-${o.level ?? ''}`}
                  onClick={() => save(item.key, { type: o.type, level: o.level })}
                  disabled={saving === item.key}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors disabled:opacity-40 ${
                    current && current.type === o.type && current.level === o.level
                      ? 'border-[var(--accent)] bg-[var(--card-hover)] text-[var(--accent)]'
                      : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--card-hover)]'
                  }`}
                >
                  {o.label}
                </button>
              ))}
              {current && (
                <button
                  onClick={() => save(item.key, { remove: true })}
                  disabled={saving === item.key}
                  className="px-2.5 py-1 text-xs rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--cinnabar)] disabled:opacity-40"
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
