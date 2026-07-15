'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReadingContext, createDefaultContext } from '@/lib/agent/context';
import { stashAskContext } from '@/lib/ask-context';
import { trackEvent } from '@/lib/user-data';

/**
 * AI 解释/译文面板：划词「问道」「译文」的结果展示层。
 *
 * 为什么拆成独立组件：
 * 1. 内容边界 —— 面板内「原文摘录」与「AI 生成内容」必须分区展示并显式标注，
 *    这一展示规范集中在此实现，解释与现代汉语转写复用同一容器；
 * 2. 请求逻辑自包含 —— 面板挂载即发起请求，父组件（Reader）只负责
 *    传入工具名、选中文本与阅读上下文，不感知 Agent API 细节。
 */

/** 面板支持的 AI 工具及其展示文案 */
const TOOL_LABELS = {
  explain_selected_text: { title: '問道', subtitle: 'AI 解释 · 仅供参考' },
  translate_to_modern_chinese: { title: '譯文', subtitle: 'AI 现代汉语转写 · 仅供参考' },
} as const;

export type ExplainTool = keyof typeof TOOL_LABELS;

export default function ExplainPanel({
  tool,
  sourceText,
  reading,
  onClose,
}: {
  /** 调用的 AI 工具（解释 / 译文） */
  tool: ExplainTool;
  sourceText: string;
  /** 当前阅读上下文（书名/位置），随请求注入 AgentContext */
  reading: ReadingContext;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading');
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState('');

  /** 带着当前阅读上下文（含选中原文）跳转到问道页继续多轮对话 */
  const continueInAsk = () => {
    stashAskContext(reading);
    trackEvent('ai_question', { bookId: reading.bookId, scope: 'continue-in-ask' });
    router.push('/ask');
  };

  useEffect(() => {
    const controller = new AbortController();
    trackEvent('ai_explanation', { bookId: reading.bookId, tool });

    const context = createDefaultContext({ path: `/text/${reading.bookId}`, pageType: 'reader' });
    context.reading = reading;
    // 用户主动点击「问道」/「译文」即视为同意本次 AI 调用
    context.permissions.canUseAI = true;

    fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'tool',
        tool,
        input: { text: sourceText },
        context,
      }),
      signal: controller.signal,
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.result?.explanation) {
          setExplanation(data.result.explanation);
          setState('done');
        } else {
          setError(data.error || 'AI 服务暂时不可用');
          setState('error');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('网络请求失败，请稍后重试');
          setState('error');
        }
      });

    return () => controller.abort();
  }, [tool, sourceText, reading]);

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center lg:p-4 bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-label="AI 解释"
        className="w-full lg:max-w-lg max-h-[75vh] overflow-y-auto bg-[var(--card)] border border-[var(--border)] rounded-t-xl lg:rounded-lg shadow-[var(--shadow-soft)] p-5 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">
            <span className="text-[var(--cinnabar)] mr-1.5">{TOOL_LABELS[tool].title}</span>
            <span className="text-xs font-normal text-[var(--muted)]">{TOOL_LABELS[tool].subtitle}</span>
          </h3>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)] p-1" aria-label="关闭">✕</button>
        </div>

        {/* 原文摘录：只读、与 AI 内容分区 */}
        <blockquote className="text-xs text-[var(--text-secondary)] bg-[var(--bg)] border-l-2 border-[var(--accent-light)] rounded px-3 py-2 mb-4 max-h-28 overflow-y-auto">
          {sourceText}
        </blockquote>

        {state === 'loading' && (
          <div className="space-y-2 py-2" aria-live="polite" aria-label="解释生成中">
            {[80, 95, 60].map((w, i) => (
              <div key={i} className="h-3.5 bg-[var(--border)] rounded animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}

        {state === 'done' && (
          <>
            <div className="text-sm leading-relaxed whitespace-pre-wrap">{explanation}</div>
            {/* 继续对话入口：把选中原文与阅读位置带入问道页做多轮追问 */}
            <button
              onClick={continueInAsk}
              className="mt-3 text-xs text-[var(--accent)] hover:underline"
            >
              去智能问道继续追问 →
            </button>
          </>
        )}

        {state === 'error' && (
          <p className="text-sm text-[var(--muted)] py-2">{error}</p>
        )}

        {/* AI 内容免责声明：常驻，不可折叠 */}
        <p className="text-xs text-[var(--muted)] mt-4 pt-3 border-t border-[var(--border)]">
          以上内容由 AI 生成，可能存在错误，不代表典籍原意，请以原文与权威注疏为准。
        </p>
      </div>
    </div>
  );
}
