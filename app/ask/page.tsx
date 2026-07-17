'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AgentMessage, Citation, ReadingContext, createDefaultContext } from '@/lib/agent/context';
import { consumeAskContext } from '@/lib/ask-context';
import { trackEvent } from '@/lib/user-data';
import { consumeAgentSse } from '@/lib/agent/sse-client';

/**
 * 智能问道：AI 对话页（客户端）。
 *
 * 组件职责边界：
 * - 本页只负责对话 UI 与 /api/agent 的 chat 契约调用，
 *   检索增强、提示词、引用组装全部在服务端（lib/agent/chat.ts）完成；
 * - AI 回答与引用来源分区展示（内容边界原则），每条回答自带 AI 标注；
 * - AI 未配置时给出诚实的不可用状态，不伪装能力。
 */

interface ChatMessage extends AgentMessage {
  citations?: Citation[];
}

const SUGGESTED_QUESTIONS = [
  '《道德經》的核心思想是什么？',
  '什么是「清静无为」？',
  '《黃庭經》讲了什么内容？',
  '道教的三洞四辅是如何分类的？',
];

const ASK_HISTORY_KEY = 'dz.ask-history.v1';
const MAX_STORED_MESSAGES = 10; // 最近 5 轮

function loadAskHistory(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(ASK_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed.slice(-MAX_STORED_MESSAGES) : [];
  } catch {
    return [];
  }
}

function saveAskHistory(messages: ChatMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      ASK_HISTORY_KEY,
      JSON.stringify(messages.slice(-MAX_STORED_MESSAGES).map(m => ({
        role: m.role,
        content: m.content,
        citations: m.citations,
      }))),
    );
  } catch {
    // sessionStorage 满或禁用时忽略
  }
}

export default function AskPage() {
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  /** 从阅读页带入的上下文（「问道此书」/「继续追问」入口），可手动移除 */
  const [reading, setReading] = useState<ReadingContext | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [historyReady, setHistoryReady] = useState(false);

  // 探测 AI 配置状态：决定展示对话界面还是「尚未开通」状态
  useEffect(() => {
    fetch('/api/agent')
      .then(r => r.json())
      .then(data => setAiConfigured(Boolean(data.aiConfigured)))
      .catch(() => setAiConfigured(false));
  }, []);

  // 恢复本会话最近对话；再消费阅读页上下文（须先于 save，避免空数组冲掉历史）
  useEffect(() => {
    setMessages(loadAskHistory());
    setHistoryReady(true);
    const ctx = consumeAskContext();
    if (ctx) setReading(ctx);
  }, []);

  // 持久化最近 5 轮，刷新可恢复
  useEffect(() => {
    if (!historyReady) return;
    saveAskHistory(messages);
  }, [messages, historyReady]);

  // 新消息滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: q }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    trackEvent('ai_question', { scope: 'ask-page' });

    const context = createDefaultContext({ path: '/ask', pageType: 'other' });
    // 用户主动提问即视为同意本次 AI 调用
    context.permissions.canUseAI = true;
    context.conversation = { messages: nextMessages.map(m => ({ role: m.role, content: m.content })) };
    // 阅读页带入的语境：服务端检索增强会据此注入「正在阅读」参考
    if (reading) context.reading = reading;

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ action: 'chat', context, stream: true }),
      });

      let reply = '';
      let citations: Citation[] | undefined;
      setMessages([...nextMessages, { role: 'assistant', content: '' }]);

      const meta = await consumeAgentSse(res, chunk => {
        reply += chunk;
        setMessages(prev => {
          const base = prev.slice(0, -1);
          return [...base, { role: 'assistant' as const, content: reply, citations }];
        });
      });

      citations = meta.citations as Citation[] | undefined;
      setMessages([
        ...nextMessages,
        { role: 'assistant', content: reply, citations },
      ]);
    } catch (e) {
      setMessages([
        ...nextMessages,
        { role: 'assistant', content: `抱歉，${e instanceof Error ? e.message : '网络请求失败，请稍后再试。'}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // AI 未配置：诚实的不可用状态（密钥只在服务端 .env，前端绝不提供填钥入口）
  if (aiConfigured === false) {
    return (
      <div className="animate-fade-in text-center py-20">
        <h1 className="text-2xl font-serif tracking-wider mb-4">智能问道</h1>
        <p className="text-sm text-[var(--muted)] max-w-md mx-auto leading-relaxed">
          AI 问答服务尚未开通。模型密钥仅由站长在服务端配置，浏览器端不提供填钥入口，以免泄露。
        </p>
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-6 max-w-lg mx-auto text-left text-xs text-[var(--muted)] bg-[var(--card)] border border-[var(--border)] rounded-lg px-4 py-3 leading-relaxed">
            <p className="mb-2 text-[var(--text-secondary)]">本地开发：在项目根目录 <code className="text-[var(--accent)]">.env.local</code> 写入后重启 <code>npm run dev</code>：</p>
            <pre className="whitespace-pre-wrap font-mono text-[11px] text-[var(--text-secondary)]">{`DZ_LLM_API_KEY=sk-...
DZ_LLM_BASE_URL=https://api.deepseek.com
DZ_LLM_MODEL=deepseek-v4-pro
DZ_LLM_MODEL_FAST=deepseek-v4-flash`}</pre>
          </div>
        )}
        <Link href="/catalog" className="inline-block mt-8 text-sm text-[var(--accent)] hover:underline">
          先去阅读典籍 →
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex flex-col min-h-[70vh]">
      <header className="mb-6">
        <h1 className="text-2xl font-serif tracking-wider mb-2">智能问道</h1>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--muted)]">
            就道藏典籍向 AI 提问。回答由 AI 生成、仅供参考，请以原文与权威注疏为准。本页最近对话会暂存在本会话中。
          </p>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                try { sessionStorage.removeItem(ASK_HISTORY_KEY); } catch { /* ignore */ }
              }}
              className="shrink-0 text-xs text-[var(--muted)] hover:text-[var(--accent)]"
            >
              清空对话
            </button>
          )}
        </div>

        {/* 阅读上下文标签：显式可见、可移除，用户始终知道 AI 参考了什么 */}
        {reading && (
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-[var(--card)] border border-[var(--accent-light)] rounded-full text-xs animate-fade-in">
            <span className="text-[var(--muted)]">结合阅读上下文：</span>
            <Link href={`/text/${reading.bookId}`} className="text-[var(--accent)] hover:underline">
              《{reading.bookTitle ?? '未知典籍'}》
            </Link>
            {reading.selectedText && (
              <span className="text-[var(--muted)] max-w-[180px] truncate">「{reading.selectedText}」</span>
            )}
            <button
              onClick={() => setReading(null)}
              className="text-[var(--muted)] hover:text-[var(--text)]"
              aria-label="移除阅读上下文"
            >
              ✕
            </button>
          </div>
        )}
      </header>

      {/* 消息列表 */}
      <div className="flex-1 space-y-4 mb-6">
        {messages.length === 0 && aiConfigured && (
          <div className="py-8">
            <p className="text-sm text-[var(--muted)] text-center mb-4">可以从这些问题开始：</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-xl mx-auto">
              {/* 带阅读上下文时优先给出针对当前书的问题建议 */}
              {(reading?.bookTitle
                ? [
                    reading.selectedText ? '请解释我选中的这段原文。' : `《${reading.bookTitle}》主要讲了什么？`,
                    `《${reading.bookTitle}》属于道教哪个传统？`,
                    ...SUGGESTED_QUESTIONS.slice(0, 2),
                  ]
                : SUGGESTED_QUESTIONS
              ).map(q => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="text-left px-4 py-3 text-sm bg-[var(--card)] border border-[var(--border)] rounded-lg hover:border-[var(--accent-light)] hover:text-[var(--accent)] transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--card)] border border-[var(--border)]'
              }`}
            >
              {m.role === 'assistant' && (
                <p className="text-xs text-[var(--cinnabar)] mb-1.5">AI 回答 · 仅供参考</p>
              )}
              <div className="whitespace-pre-wrap">{m.content}</div>

              {/* 引用来源：与 AI 回答分区展示，可点击跳转原文 */}
              {m.citations && m.citations.filter(c => c.bookTitle).length > 0 && (
                <div className="mt-3 pt-2 border-t border-[var(--border)] text-xs text-[var(--muted)]">
                  <span className="mr-2">参考：</span>
                  {m.citations.filter(c => c.bookTitle).map((c, j) => (
                    <Link
                      key={j}
                      href={`/text/${c.bookId}`}
                      className="text-[var(--accent)] hover:underline mr-3"
                    >
                      《{c.bookTitle}》
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start" aria-live="polite" aria-label="回答生成中">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-4 py-3 space-y-2 w-64">
              {[85, 60].map((w, i) => (
                <div key={i} className="h-3 bg-[var(--border)] rounded animate-pulse" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <form
        onSubmit={e => { e.preventDefault(); send(input); }}
        className="sticky bottom-4"
      >
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={aiConfigured === null ? '正在连接…' : '输入您的问题…'}
            disabled={aiConfigured === null || loading}
            className="w-full px-5 py-3 pr-16 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:border-[var(--accent)] transition-colors shadow-[var(--shadow-soft)] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading || aiConfigured === null}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs rounded bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            发送
          </button>
        </div>
      </form>
    </div>
  );
}
