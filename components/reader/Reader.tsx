'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { stashAskContext } from '@/lib/ask-context';
import { ParsedBook } from '@/lib/content-schema';
import { DaozangEntry } from '@/lib/data';
import {
  saveProgress,
  getProgress,
  addBookmark,
  addNote,
  trackEvent,
} from '@/lib/user-data';
import { useLocalData, useReaderSettings } from '@/lib/use-local-data';
import { ReadingContext } from '@/lib/agent/context';
import BlockRenderer from './BlockRenderer';
import TocPanel from './TocPanel';
import SettingsPanel from './SettingsPanel';
import SelectionToolbar, { SelectionInfo } from './SelectionToolbar';
import NoteDialog from './NoteDialog';
import ExplainPanel, { ExplainTool } from './ExplainPanel';
import InBookSearch from './InBookSearch';

/** AI 配置状态的会话级缓存：每次会话只探测一次，切换典籍不重复请求 */
let aiConfiguredCache: boolean | null = null;

/**
 * 目录当前章追踪：观察所有目录锚点标题，返回视口上方最近的一个。
 * 用 IntersectionObserver 而非 scroll 计算：只在标题进出视口时触发，
 * 长文页面滚动时零额外计算成本。
 */
function useActiveTocId(toc: { blockId: string }[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (toc.length === 0) return;
    // 记录每个标题相对视口顶部的状态，取「已越过顶部线的最后一个标题」为当前章
    const above = new Map<string, boolean>();
    const order = toc.map(t => t.blockId);

    const pickActive = () => {
      let current: string | null = null;
      for (const id of order) {
        if (above.get(id)) current = id;
        else break;
      }
      setActiveId(current ?? order[0]);
    };

    const observer = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          // rootMargin 把判定线设在视口顶部下方 30% 处，贴近实际阅读焦点
          above.set((e.target as HTMLElement).id, e.boundingClientRect.top < window.innerHeight * 0.3);
        }
        pickActive();
      },
      { rootMargin: '-30% 0px 0px 0px', threshold: 0 },
    );

    for (const id of order) {
      const el = document.getElementById(id);
      if (el) {
        above.set(id, el.getBoundingClientRect().top < window.innerHeight * 0.3);
        observer.observe(el);
      }
    }
    pickActive();

    return () => observer.disconnect();
  }, [toc]);

  return activeId;
}

/**
 * 阅读器主组件（客户端）。
 *
 * 组件拆分的整体思路：
 * - 正文渲染（BlockRenderer）、目录（TocPanel）、设置（SettingsPanel）、
 *   划词（SelectionToolbar）、笔记（NoteDialog）各自独立，本组件只做「编排」：
 *   管理状态、持久化、滚动追踪，并把回调注入各子组件；
 * - 正文内容由服务端组件解析并注入（SEO 可读），本组件不负责取数；
 * - 阅读器实时维护 ReadingContext（当前书、进度、选中文字），
 *   这正是未来 Agent「知道用户在读什么」的数据来源 —— 已按 Agent 契约组织。
 */

type AdjacentLink = { id: string; title: string } | null;

export default function Reader({
  entry,
  parsed,
  prev,
  next,
}: {
  entry: DaozangEntry;
  parsed: ParsedBook;
  prev: AdjacentLink;
  next: AdjacentLink;
}) {
  const router = useRouter();
  // ---- 阅读设置：水合安全的共享 store，本地持久化 ----
  const [settings, updateSettings] = useReaderSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);

  // ---- 划词与笔记 ----
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [noteSource, setNoteSource] = useState<{ text: string; blockId?: string } | null>(null);
  const [toast, setToast] = useState('');

  // ---- AI 解释 / 译文 ----
  const [aiConfigured, setAiConfigured] = useState<boolean>(aiConfiguredCache ?? false);
  /** 点击「问道」/「译文」时的完整快照（含滚动进度）：ref 只能在事件处理器中读取 */
  const [explainSource, setExplainSource] = useState<{
    tool: ExplainTool;
    text: string;
    blockId?: string;
    scrollProgress?: number;
  } | null>(null);

  // ---- 进度 ----
  const [progress, setProgress] = useState(0);
  // 历史进度从本地读取（水合安全）；「继续阅读」提示可被用户关闭且不自动跳转
  const [savedProgress] = useLocalData(() => getProgress(entry.id), undefined);
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const resumeAt =
    !resumeDismissed && savedProgress && savedProgress.scrollProgress > 0.02 && savedProgress.scrollProgress < 0.98
      ? savedProgress.scrollProgress
      : null;

  const articleRef = useRef<HTMLDivElement>(null);
  /** 阅读上下文实时快照：Agent 接入后由此注入 AgentContext.reading */
  const readingCtxRef = useRef<ReadingContext>({ bookId: entry.id, bookTitle: entry.title });

  // 目录当前章高亮
  const activeTocId = useActiveTocId(parsed.toc);

  /** 传给 AI 解释面板的阅读上下文：memo 化避免滚动重渲染导致面板重复请求 */
  const explainReading = useMemo<ReadingContext | null>(
    () =>
      explainSource
        ? {
            bookId: entry.id,
            bookTitle: entry.title,
            blockId: explainSource.blockId,
            scrollProgress: explainSource.scrollProgress,
            selectedText: explainSource.text,
          }
        : null,
    [explainSource, entry.id, entry.title],
  );

  useEffect(() => {
    trackEvent('book_open', { bookId: entry.id });
  }, [entry.id]);

  // 探测 AI 服务是否已配置：决定「问道」按钮是否可用（会话级缓存）
  useEffect(() => {
    if (aiConfiguredCache !== null) return;
    fetch('/api/agent')
      .then(r => r.json())
      .then(data => {
        aiConfiguredCache = Boolean(data.aiConfigured);
        setAiConfigured(aiConfiguredCache);
      })
      .catch(() => { aiConfiguredCache = false; });
  }, []);

  // 阅读主题挂在 <html> 上：导航、页脚随正文一并换色，保证夜间模式沉浸感；
  // 离开阅读页时清除，其他页面保持默认宣纸主题
  useEffect(() => {
    document.documentElement.setAttribute('data-reader-theme', settings.theme);
    return () => document.documentElement.removeAttribute('data-reader-theme');
  }, [settings.theme]);

  // ---- 滚动进度追踪：节流保存，供「继续阅读」与书房「最近阅读」使用 ----
  useEffect(() => {
    let ticking = false;
    let lastSave = 0;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const doc = document.documentElement;
        const max = doc.scrollHeight - window.innerHeight;
        const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
        setProgress(p);
        readingCtxRef.current.scrollProgress = p;
        // 5 秒最多保存一次，避免频繁写 localStorage
        const now = Date.now();
        if (now - lastSave > 5000) {
          lastSave = now;
          saveProgress({
            bookId: entry.id,
            bookTitle: entry.title,
            category: entry.category,
            scrollProgress: p,
          });
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [entry.id, entry.title, entry.category]);

  // ---- 划词监听：仅响应正文区域内的选区 ----
  useEffect(() => {
    const onSelect = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!articleRef.current?.contains(range.commonAncestorContainer)) return;

      const rect = range.getBoundingClientRect();
      const containerRect = articleRef.current.getBoundingClientRect();
      // 溯源：找到选区所在的内容块 ID，让收藏/笔记/AI 都能定位回原文
      const blockEl = (range.startContainer.parentElement as HTMLElement | null)?.closest('[data-block-id]');
      const text = sel.toString().trim();
      readingCtxRef.current.selectedText = text;
      trackEvent('text_select', { bookId: entry.id });
      setSelection({
        text,
        blockId: blockEl?.getAttribute('data-block-id') ?? undefined,
        top: rect.top - containerRect.top - 44,
        left: Math.max(0, rect.left - containerRect.left),
      });
    };
    document.addEventListener('mouseup', onSelect);
    document.addEventListener('touchend', onSelect);
    return () => {
      document.removeEventListener('mouseup', onSelect);
      document.removeEventListener('touchend', onSelect);
    };
  }, [entry.id]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  // ---- 划词动作 ----
  const handleCopySelection = async () => {
    if (!selection) return;
    await navigator.clipboard.writeText(selection.text);
    setSelection(null);
    showToast('已复制');
  };

  const handleBookmarkSelection = () => {
    if (!selection) return;
    addBookmark({
      bookId: entry.id,
      bookTitle: entry.title,
      blockId: selection.blockId,
      excerpt: selection.text.slice(0, 200),
    });
    setSelection(null);
    showToast('已收藏此段');
  };

  const handleOpenNote = () => {
    if (!selection) return;
    setNoteSource({ text: selection.text, blockId: selection.blockId });
    setSelection(null);
  };

  const handleAskAI = (tool: ExplainTool) => {
    if (!selection) return;
    setExplainSource({
      tool,
      text: selection.text,
      blockId: selection.blockId,
      // 在事件处理器中读取阅读上下文快照（渲染期间不允许访问 ref）
      scrollProgress: readingCtxRef.current.scrollProgress,
    });
    setSelection(null);
    trackEvent('ai_question', { bookId: entry.id, tool });
  };

  const handleSaveNote = (noteText: string) => {
    if (!noteSource) return;
    addNote({
      bookId: entry.id,
      bookTitle: entry.title,
      blockId: noteSource.blockId,
      sourceText: noteSource.text,
      noteText,
      tags: [],
    });
    setNoteSource(null);
    showToast('笔记已保存');
  };

  const handleCopyAll = async () => {
    // 从结构化块还原文本（保留既有「复制全文」功能）
    await navigator.clipboard.writeText(parsed.blocks.map(b => b.content).join('\n'));
    showToast('已复制全文');
  };

  const handleBookmarkBook = () => {
    addBookmark({ bookId: entry.id, bookTitle: entry.title });
    showToast('已收藏本书');
  };

  /** 「问道此书」：带着当前阅读上下文跳转到智能问道页 */
  const handleAskAboutBook = () => {
    stashAskContext({
      bookId: entry.id,
      bookTitle: entry.title,
      scrollProgress: readingCtxRef.current.scrollProgress,
    });
    trackEvent('ai_question', { bookId: entry.id, scope: 'ask-about-book' });
    router.push('/ask');
  };

  const handleResume = () => {
    if (resumeAt === null) return;
    const doc = document.documentElement;
    window.scrollTo({ top: (doc.scrollHeight - window.innerHeight) * resumeAt, behavior: 'smooth' });
    setResumeDismissed(true);
  };

  const widthClass =
    settings.width === 'narrow'
      ? 'max-w-[var(--content-width-narrow)]'
      : settings.width === 'wide'
        ? 'max-w-[var(--content-width-wide)]'
        : 'max-w-[var(--content-width)]';

  const toolBtn =
    'px-3 py-1.5 text-xs border border-[var(--border)] rounded hover:bg-[var(--card-hover)] transition-colors text-[var(--muted)] hover:text-[var(--text)]';

  return (
    <div className="pb-14 lg:pb-0">
      {/* 顶部细进度条：非打扰式的阅读位置反馈 */}
      <div className="fixed top-0 left-0 right-0 h-0.5 z-50 bg-transparent" aria-hidden>
        <div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* 面包屑 */}
      <nav className="text-xs text-[var(--muted)] mb-6 flex items-center gap-1.5 flex-wrap" aria-label="面包屑">
        <Link href="/" className="hover:text-[var(--accent)]">首页</Link>
        <span>›</span>
        <Link href={`/catalog?cat=${encodeURIComponent(entry.category)}`} className="hover:text-[var(--accent)]">
          {entry.category}
        </Link>
        {entry.subcategory && (
          <>
            <span>›</span>
            <Link
              href={`/catalog?cat=${encodeURIComponent(entry.category)}&sub=${encodeURIComponent(entry.subcategory)}`}
              className="hover:text-[var(--accent)]"
            >
              {entry.subcategory}
            </Link>
          </>
        )}
        <span>›</span>
        <span className="text-[var(--text)] truncate max-w-[200px]">{entry.title}</span>
      </nav>

      {/* 书名与元信息 */}
      <header className="mb-6 pb-6 border-b border-[var(--border)]">
        <h1 className="text-2xl md:text-3xl font-serif tracking-wider mb-3">{entry.title}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
          <span>{entry.collection}</span>
          {entry.subcategory && <span>{entry.subcategory}</span>}
          {entry.author && <span>{entry.author}</span>}
          <span>{entry.lineCount} 行</span>
        </div>
      </header>

      {/* 工具栏 */}
      <div className="flex items-center justify-end gap-2 mb-4 relative">
        {/* AI 已配置才展示：带阅读上下文进入问道页 */}
        {aiConfigured && (
          <button onClick={handleAskAboutBook} className={toolBtn}>问道此书</button>
        )}
        <button onClick={handleBookmarkBook} className={toolBtn}>收藏本书</button>
        <button onClick={handleCopyAll} className={toolBtn}>复制全文</button>
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className={toolBtn}
          aria-expanded={settingsOpen}
        >
          阅读设置
        </button>
        {settingsOpen && (
          <div className="absolute right-0 top-full mt-2 z-40 w-72 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-[var(--shadow-soft)] px-4 py-2">
            <SettingsPanel settings={settings} onChange={updateSettings} />
          </div>
        )}
      </div>

      {/* 主体：桌面端目录侧栏 + 正文 */}
      <div className="flex gap-8">
        <aside className="hidden lg:block w-44 shrink-0">
          <div className="sticky top-8 max-h-[85vh] overflow-y-auto pr-2">
            <InBookSearch blocks={parsed.blocks} />
            {parsed.toc.length > 1 && (
              <>
                <p className="text-xs text-[var(--muted)] mb-2 tracking-wider">目 录</p>
                <TocPanel toc={parsed.toc} activeId={activeTocId} />
              </>
            )}
          </div>
        </aside>

        <div className={`flex-1 min-w-0 mx-auto ${widthClass} relative`} ref={articleRef}>
          {/* 继续阅读提示：可关闭、不自动跳转 */}
          {resumeAt !== null && (
            <div className="mb-6 flex items-center justify-between gap-3 px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs animate-fade-in">
              <span className="text-[var(--muted)]">上次读到 {Math.round(resumeAt * 100)}%，是否继续？</span>
              <div className="flex gap-2 shrink-0">
                <button onClick={handleResume} className="text-[var(--accent)] hover:underline">继续阅读</button>
                <button onClick={() => setResumeDismissed(true)} className="text-[var(--muted)] hover:text-[var(--text)]" aria-label="关闭">✕</button>
              </div>
            </div>
          )}

          <article
            className="reading-area"
            style={
              {
                '--reader-font-size': `${settings.fontSize}px`,
                '--reader-line-height': settings.lineHeight,
              } as React.CSSProperties
            }
          >
            <BlockRenderer blocks={parsed.blocks} showEditorNotes={settings.showEditorNotes} />
          </article>

          {selection && (
            <SelectionToolbar
              selection={selection}
              onCopy={handleCopySelection}
              onBookmark={handleBookmarkSelection}
              onNote={handleOpenNote}
              // AI 未配置时保持禁用态（能力预告而非伪装）
              onAskAI={aiConfigured ? () => handleAskAI('explain_selected_text') : undefined}
              onTranslate={aiConfigured ? () => handleAskAI('translate_to_modern_chinese') : undefined}
            />
          )}

          {/* 上一篇 / 下一篇：服务端注入，无需客户端再请求 */}
          <nav className="flex justify-between items-center mt-12 pt-6 border-t border-[var(--border)]" aria-label="相邻典籍">
            {prev ? (
              <Link href={`/text/${prev.id}`} className="text-sm text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
                <span className="text-xs block mb-0.5">上一篇</span>
                <span className="truncate block max-w-[200px]">{prev.title}</span>
              </Link>
            ) : <div />}
            {next ? (
              <Link href={`/text/${next.id}`} className="text-sm text-[var(--muted)] hover:text-[var(--accent)] transition-colors text-right">
                <span className="text-xs block mb-0.5">下一篇</span>
                <span className="truncate block max-w-[200px]">{next.title}</span>
              </Link>
            ) : <div />}
          </nav>

          <div className="mt-8 p-4 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs text-[var(--muted)] text-center">
            本文本仅供学术研究用途，版权归原作者及相关机构所有。
          </div>
        </div>
      </div>

      {/* 移动端底部工具栏：目录 / 设置 / 回顶部 */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--card)] border-t border-[var(--border)] flex justify-around py-2 text-xs text-[var(--muted)]">
        <button onClick={() => setTocOpen(true)} className="px-4 py-1">目录</button>
        <button onClick={() => setSettingsOpen(!settingsOpen)} className="px-4 py-1">设置</button>
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="px-4 py-1">回顶</button>
      </div>

      {/* 移动端目录抽屉（含书内搜索） */}
      {tocOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/30" onClick={() => setTocOpen(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[60vh] overflow-y-auto bg-[var(--card)] rounded-t-xl p-5 animate-fade-in"
            onClick={e => e.stopPropagation()}
          >
            <InBookSearch blocks={parsed.blocks} onNavigate={() => setTocOpen(false)} />
            <p className="text-xs text-[var(--muted)] mb-3 tracking-wider">目 录</p>
            <TocPanel toc={parsed.toc} activeId={activeTocId} onNavigate={() => setTocOpen(false)} />
          </div>
        </div>
      )}

      {noteSource && (
        <NoteDialog
          sourceText={noteSource.text}
          onSave={handleSaveNote}
          onClose={() => setNoteSource(null)}
        />
      )}

      {explainSource && explainReading && (
        <ExplainPanel
          tool={explainSource.tool}
          sourceText={explainSource.text}
          reading={explainReading}
          onClose={() => setExplainSource(null)}
        />
      )}

      {/* 轻提示 */}
      {toast && (
        <div className="fixed bottom-16 lg:bottom-8 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-[var(--text)] text-[var(--bg)] text-xs rounded-full animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
