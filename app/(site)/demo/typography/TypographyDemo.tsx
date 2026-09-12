'use client';

/**
 * 缺图排版试验页：视觉对齐 daozangBookUI typography-demo，
 * 数据来自真实底稿解析结果 + 缺图候选 sidecar。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ContentBlock, ParsedBook } from '@/lib/content-schema';
import type { IllustrationCandidate, IllustrationPlacement } from '@/lib/illustrations/candidates';
import { kindLabel } from '@/lib/illustrations/kinds';
import './typography-demo.css';

const THEMES: Record<string, Record<string, string>> = {
  xuanzhi: { bg: '#F5EFE0', soft: '#EDE5D0', ink: '#3A3226', faint: '#8A7F6E', accent: '#B5442F', frame: '#B9A98A', panel: '#FBF6E8', mark: '#F2D98C' },
  mibai: { bg: '#FBF6E8', soft: '#F2EDDE', ink: '#33302A', faint: '#94897A', accent: '#B5442F', frame: '#C9BEA8', panel: '#FFFDF6', mark: '#F4E3B2' },
  huyan: { bg: '#E7EDE3', soft: '#DCE4D7', ink: '#2F3A30', faint: '#75806F', accent: '#3F6B4F', frame: '#A8B8A6', panel: '#F1F5EE', mark: '#D8E3C8' },
  night: { bg: '#1C1C1E', soft: '#29292C', ink: '#D8D2C4', faint: '#8B8577', accent: '#E06C5A', frame: '#4A463E', panel: '#26262A', mark: '#4A4232' },
  daozang: { bg: '#F3EAD6', soft: '#E9DEC4', ink: '#38291B', faint: '#8F7D63', accent: '#9E2B22', frame: '#A98452', panel: '#F7F0E0', mark: '#EED9A8' },
};

const FONTS: Record<string, string> = {
  song: '"Noto Serif SC","Source Han Serif SC","SimSun",serif',
  kai: '"Kaiti SC","KaiTi","STKaiti",cursive',
  hei: '"Noto Sans SC","Microsoft YaHei",sans-serif',
};

export interface DemoBookInfo {
  id: string;
  title: string;
  collection: string;
  category: string;
  subcategory: string;
  author?: string;
}

export interface DemoBookOption {
  id: string;
  title: string;
  category: string;
  count: number;
}

interface Props {
  entry: DemoBookInfo;
  parsed: ParsedBook;
  candidates: IllustrationCandidate[];
  placements: IllustrationPlacement[];
  catalogBooks: DemoBookOption[];
  scanned: boolean;
  initialSlot?: string;
}

export default function TypographyDemo({
  entry,
  parsed,
  candidates,
  placements,
  catalogBooks,
  scanned,
  initialSlot,
}: Props) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'h' | 'v'>('h');
  const [theme, setTheme] = useState('xuanzhi');
  const [font, setFont] = useState('song');
  const [fs, setFs] = useState(18);
  const [tocOpen, setTocOpen] = useState(true);
  const [structOpen, setStructOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [activeSlot, setActiveSlot] = useState(initialSlot ?? '');

  const bodyCandidates = useMemo(
    () => candidates.filter(c => c.signal !== 'title-tu'),
    [candidates],
  );
  const titleTu = candidates.find(c => c.signal === 'title-tu');
  const placementByAfter = useMemo(() => groupBy(placements, 'afterBlockId'), [placements]);
  const placementByBefore = useMemo(() => groupBy(placements, 'beforeBlockId'), [placements]);
  const hideIds = useMemo(() => new Set(placements.flatMap(p => p.hideBlockIds)), [placements]);
  const unbound = useMemo(() => {
    const placed = new Set(placements.map(p => p.candidate.id));
    return bodyCandidates.filter(c => !placed.has(c.id));
  }, [bodyCandidates, placements]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2200);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const t = THEMES[theme];
    root.style.setProperty('--bg', t.bg);
    root.style.setProperty('--bg-soft', t.soft);
    root.style.setProperty('--ink', t.ink);
    root.style.setProperty('--ink-faint', t.faint);
    root.style.setProperty('--accent', t.accent);
    root.style.setProperty('--frame', t.frame);
    root.style.setProperty('--panel', t.panel);
    root.style.setProperty('--mark', t.mark);
    root.style.setProperty('--fs', `${fs}px`);
    root.style.fontFamily = FONTS[font];
  }, [theme, font, fs]);

  useEffect(() => {
    if (mode !== 'v') return;
    const fr = readerRef.current?.querySelector('.typo-v-frame');
    if (fr) fr.scrollLeft = fr.scrollWidth;
  }, [mode, parsed.bookId]);

  const goToSlot = useCallback((id: string) => {
    setActiveSlot(id);
    const params = new URLSearchParams({ book: entry.id, slot: id });
    window.history.replaceState(null, '', `/demo/typography?${params.toString()}`);
  }, [entry.id]);

  useEffect(() => {
    if (!activeSlot) return;
    document.getElementById(`slot-${cssId(activeSlot)}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center',
    });
  }, [activeSlot, parsed.bookId, mode]);

  useEffect(() => {
    if (mode !== 'v') return;
    const reader = readerRef.current;
    if (!reader) return;
    const onWheelNative = (e: WheelEvent) => {
      const fr = reader.querySelector('.typo-v-frame');
      if (!fr || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      fr.scrollLeft -= e.deltaY;
      e.preventDefault();
    };
    reader.addEventListener('wheel', onWheelNative, { passive: false });
    return () => reader.removeEventListener('wheel', onWheelNative);
  }, [mode, parsed.bookId]);

  async function onAi(p: IllustrationPlacement) {
    showToast(`正在请求 AI 配图：「${p.candidate.clue}」`);
    try {
      const res = await fetch('/api/illustrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: entry.id,
          blockId: p.candidate.blockId ?? parsed.blocks[0]?.id,
          text: p.candidate.excerpt || p.candidate.clue,
          type: p.candidate.kind,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(data.error || 'AI 配图未能开始（演示）');
        return;
      }
      showToast('已创建配图任务。结果不写入原文，也不进入正式阅读页。');
    } catch {
      showToast('AI 配图请求失败（演示）');
    }
  }

  const books = catalogBooks.some(b => b.id === entry.id)
    ? catalogBooks
    : [{ id: entry.id, title: entry.title, category: entry.category, count: bodyCandidates.length }, ...catalogBooks];

  return (
    <div className="typo-root" ref={rootRef}>
      <header className="typo-topbar">
        <Link className="typo-brand" href="/">
          道藏·缺图试验<small>typography demo</small>
        </Link>
        <select
          className="typo-ctl"
          value={entry.id}
          title="选择有缺图候选的书"
          onChange={e => router.push(`/demo/typography?book=${encodeURIComponent(e.target.value)}`)}
        >
          {books.map(b => (
            <option key={b.id} value={b.id}>
              {b.title}（{b.count}）
            </option>
          ))}
        </select>
        <div className="typo-ctl-group">
          <button type="button" className={`typo-ctl${mode === 'h' ? ' active' : ''}`} onClick={() => setMode('h')}>
            横排
          </button>
          <button type="button" className={`typo-ctl${mode === 'v' ? ' active' : ''}`} onClick={() => setMode('v')}>
            竖排
          </button>
        </div>
        <select className="typo-ctl" value={font} onChange={e => setFont(e.target.value)}>
          <option value="song">宋体</option>
          <option value="kai">楷体</option>
          <option value="hei">黑体</option>
        </select>
        <select className="typo-ctl" value={theme} onChange={e => setTheme(e.target.value)}>
          <option value="xuanzhi">宣纸</option>
          <option value="mibai">米白</option>
          <option value="huyan">护眼</option>
          <option value="night">夜间</option>
          <option value="daozang">道藏朱印</option>
        </select>
        <div className="typo-ctl-group">
          <button type="button" className="typo-ctl" onClick={() => setFs(n => Math.max(13, n - 1))}>
            A-
          </button>
          <button type="button" className="typo-ctl" onClick={() => setFs(n => Math.min(26, n + 1))}>
            A+
          </button>
        </div>
        <span className="typo-spacer" />
        <button type="button" className="typo-ctl" onClick={() => setTocOpen(v => !v)}>
          目录
        </button>
        <button type="button" className="typo-ctl" onClick={() => setStructOpen(v => !v)}>
          结构
        </button>
      </header>

      <div className="typo-layout">
        <aside className={`typo-panel${tocOpen ? '' : ' closed'}`}>
          <h3>目录</h3>
          {parsed.toc
            .filter(item => !/^別本此(印|符|圖|图)$/.test(item.title))
            .map(item => (
            <button
              key={item.blockId}
              type="button"
              className={`typo-item lv${Math.min(item.level, 2)}`}
              onClick={() => document.getElementById(item.blockId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              {item.title}
            </button>
          ))}
          <h4>本书缺图</h4>
          {titleTu && (
            <div className="typo-chip" style={{ marginBottom: 8 }}>
              书名含「圖」· {titleTu.title}
            </div>
          )}
          {bodyCandidates.length === 0 && <p className="typo-note">本书未检出插图线索。</p>}
          {bodyCandidates.map(c => {
            const lost = unbound.some(u => u.id === c.id);
            return (
              <button
                key={c.id}
                type="button"
                className={`typo-slot${lost ? ' warn' : ''}${activeSlot === c.id ? ' active' : ''}`}
                onClick={() => {
                  if (lost) {
                    showToast('待重绑：锚点对不上当前解析块');
                    return;
                  }
                  goToSlot(c.id);
                }}
              >
                〔{kindLabel(c.kind)}〕{c.slotLabel}
                <div className="meta">
                  {c.volumeTitle ? `${c.volumeTitle} · ` : ''}
                  {Math.round(c.confidence * 100)}%
                  {lost ? ' · 待重绑' : ''}
                </div>
              </button>
            );
          })}
          <p style={{ marginTop: 16 }}>
            <Link href={`/text/${entry.id}`} style={{ color: 'var(--accent)' }}>
              打开正式阅读页 →
            </Link>
          </p>
        </aside>

        <main className="typo-reader" ref={readerRef}>
          {mode === 'h' ? (
            <div className="typo-paper">
              <div className="typo-h-title">{entry.title}</div>
              <div className="typo-h-meta">
                {entry.category}
                {entry.subcategory ? ` · ${entry.subcategory}` : ''}
                {entry.author ? ` · ${entry.author}` : ''}
              </div>
              <div className="typo-h-source">底本：{entry.collection}</div>
              {renderBlocks(parsed.blocks, hideIds, placementByBefore, placementByAfter, mode, onAi, showToast, activeSlot)}
            </div>
          ) : (
            <div className="typo-v-wrap">
              <div className="typo-v-frame">
                <div className="typo-v-inner">
                  <div className="typo-v-title">{entry.title}</div>
                  {renderBlocks(parsed.blocks, hideIds, placementByBefore, placementByAfter, mode, onAi, showToast, activeSlot)}
                </div>
              </div>
            </div>
          )}
        </main>

        <aside className={`typo-panel right${structOpen ? '' : ' closed'}`}>
          <h3>结构检查器</h3>
          <p style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginBottom: 10 }}>
            圆点=置信度（绿≥0.9 / 黄≥0.6 / 红&lt;0.6）
          </p>
          {parsed.blocks.map(b => {
            const dot = b.confidence >= 0.9 ? 'hi' : b.confidence >= 0.6 ? 'mid' : 'low';
            return (
              <div key={b.id} className="typo-node">
                <span className={`typo-dot ${dot}`} />
                <span className="typo-ty">{b.type}</span>
                <span className="typo-tx">{b.content.slice(0, 18)}</span>
                <span className="typo-cf">{Math.round(b.confidence * 100)}%</span>
              </div>
            );
          })}
        </aside>
      </div>

      <div className="typo-cleanbar">
        <b>缺图扫描：</b>
        {scanned ? (
          <span className="typo-chip ok">✓ 已读目录 JSON</span>
        ) : (
          <span className="typo-chip warn">⚠ 尚未全库扫描，请运行 npm run scan:illustrations</span>
        )}
        <span className="typo-chip ok">本书占位 ×{placements.length}</span>
        <span className="typo-chip">候选 {bodyCandidates.length}</span>
        {unbound.length > 0 && <span className="typo-chip warn">待重绑 ×{unbound.length}</span>}
      </div>
      <div className={`typo-toast${toast ? ' show' : ''}`}>{toast}</div>
    </div>
  );
}

function groupBy(placements: IllustrationPlacement[], key: 'afterBlockId' | 'beforeBlockId'): Map<string, IllustrationPlacement[]> {
  const map = new Map<string, IllustrationPlacement[]>();
  for (const p of placements) {
    const id = p[key];
    if (!id) continue;
    const list = map.get(id) ?? [];
    list.push(p);
    map.set(id, list);
  }
  return map;
}

function cssId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function renderBlocks(
  blocks: ContentBlock[],
  hideIds: Set<string>,
  before: Map<string, IllustrationPlacement[]>,
  after: Map<string, IllustrationPlacement[]>,
  mode: 'h' | 'v',
  onAi: (p: IllustrationPlacement) => void,
  onUpload: (msg: string) => void,
  activeSlot: string,
) {
  return blocks.map(block => {
    const pre = before.get(block.id) ?? [];
    const post = after.get(block.id) ?? [];
    return (
      <div key={block.id}>
        {pre.map(p => (
          <Placeholder
            key={p.candidate.id}
            placement={p}
            vertical={mode === 'v'}
            active={activeSlot === p.candidate.id}
            onAi={onAi}
            onUpload={onUpload}
          />
        ))}
        {!hideIds.has(block.id) && <BlockView block={block} mode={mode} />}
        {post.map(p => (
          <Placeholder
            key={p.candidate.id}
            placement={p}
            vertical={mode === 'v'}
            active={activeSlot === p.candidate.id}
            onAi={onAi}
            onUpload={onUpload}
          />
        ))}
      </div>
    );
  });
}

function BlockView({ block, mode }: { block: ContentBlock; mode: 'h' | 'v' }) {
  const heading = block.type === 'heading' || block.type === 'subheading';
  if (mode === 'v') {
    if (heading) {
      return (
        <div className="typo-v-chapter" id={block.id}>
          {block.content}
        </div>
      );
    }
    return (
      <div className="typo-v-para" id={block.id}>
        {block.content}
      </div>
    );
  }
  if (heading) {
    return (
      <div className="typo-h-chapter" id={block.id}>
        {block.level === 3 ? <span className="tag">章</span> : null}
        {block.content}
      </div>
    );
  }
  if (block.type === 'editor-note' || block.type === 'original-note' || block.type === 'annotation') {
    return (
      <p className="typo-note" id={block.id}>
        {block.content}
      </p>
    );
  }
  return (
    <p className="typo-para" id={block.id}>
      {block.content}
    </p>
  );
}

function Placeholder({
  placement,
  vertical,
  active,
  onAi,
  onUpload,
}: {
  placement: IllustrationPlacement;
  vertical: boolean;
  active: boolean;
  onAi: (p: IllustrationPlacement) => void;
  onUpload: (msg: string) => void;
}) {
  const c = placement.candidate;
  return (
    <div
      className={`typo-illus${vertical ? ' v' : ''}${active ? ' is-active' : ''}`}
      id={`slot-${cssId(c.id)}`}
      data-illus={c.clue}
    >
      <span>〔插图〕{c.slotLabel}</span>
      <span className="hint">
        原文此处有插图（扫描由「{c.clue}」识别，置信度 {Math.round(c.confidence * 100)}%）
        {c.category ? ` · ${c.category}${c.subcategory || ''}` : ''}
        {c.volumeTitle ? ` · ${c.volumeTitle}` : ''}
      </span>
      <button type="button" onClick={() => onUpload(`演示：上传原书图「${c.clue}」（产品版接入图片库与审核流）`)}>
        上传原图
      </button>
      <button type="button" onClick={() => onAi(placement)}>
        AI 配图
      </button>
    </div>
  );
}
