'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { calibrateHref } from '@/lib/restore-calibration';

const HOLD_MS = 400;

/**
 * 正文展示复原 PNG；悬停 / 键盘焦点 / 长按 /「对照原图」显示原扫描。
 * 有朱砂与墨线两份时，切换只改展示层，对照目标永远是原图。
 */
export default function DaozangFigure({
  src,
  originalSrc,
  inkSrc,
  cinnabarSrc,
  restored,
  alt,
  bookId,
}: {
  src: string;
  originalSrc?: string;
  inkSrc?: string;
  cinnabarSrc?: string;
  restored: boolean;
  alt: string;
  bookId?: string;
}) {
  const canToggleTone = Boolean(inkSrc && cinnabarSrc);
  const defaultCinnabar = Boolean(cinnabarSrc && (src === cinnabarSrc || src.includes('.cinnabar.')));
  const [tone, setTone] = useState<'cinnabar' | 'ink'>(defaultCinnabar ? 'cinnabar' : 'ink');
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const calibrateUrl =
    restored && bookId && originalSrc
      ? calibrateHref(bookId, originalSrc, cinnabarSrc ? 'cinnabar' : inkSrc ? 'ink' : 'restored')
      : null;

  const displaySrc =
    canToggleTone
      ? tone === 'cinnabar'
        ? cinnabarSrc!
        : inkSrc!
      : src;
  const canCompare = Boolean(originalSrc && originalSrc !== displaySrc);
  const showOriginal = canCompare && (hovering || pinned);

  const clearHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  return (
    <div className={restored ? 'flex flex-col items-center gap-2 p-2' : 'flex flex-col items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3'}>
      <div
        className="relative inline-block max-w-full"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onFocus={() => setHovering(true)}
        onBlur={() => setHovering(false)}
        onPointerDown={() => {
          if (!canCompare) return;
          clearHold();
          holdTimer.current = setTimeout(() => setPinned(true), HOLD_MS);
        }}
        onPointerUp={() => {
          clearHold();
          setPinned(false);
        }}
        onPointerCancel={() => {
          clearHold();
          setPinned(false);
        }}
      >
        <img
          src={displaySrc}
          alt={alt}
          className="max-h-[70vh] w-auto max-w-full object-contain"
        />
        {canCompare && (
          <img
            src={originalSrc}
            alt=""
            aria-hidden
            className={`absolute inset-0 z-10 h-full w-full object-contain bg-[var(--card)] transition-opacity duration-150 ${showOriginal ? 'opacity-100' : 'opacity-0'}`}
          />
        )}
      </div>
      {(canCompare || canToggleTone || calibrateUrl) && (
        <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-[var(--muted)]">
          {canToggleTone && (
            <span className="inline-flex rounded border border-[var(--border)] overflow-hidden">
              <button
                type="button"
                className={`px-2 py-0.5 ${tone === 'cinnabar' ? 'bg-[var(--cinnabar)] text-white' : 'hover:bg-[var(--card-hover)]'}`}
                onClick={() => setTone('cinnabar')}
                aria-pressed={tone === 'cinnabar'}
              >
                朱砂
              </button>
              <button
                type="button"
                className={`px-2 py-0.5 ${tone === 'ink' ? 'bg-[var(--text)] text-[var(--bg)]' : 'hover:bg-[var(--card-hover)]'}`}
                onClick={() => setTone('ink')}
                aria-pressed={tone === 'ink'}
              >
                墨线
              </button>
            </span>
          )}
          {canCompare && (
            <button
              type="button"
              className={`px-2 py-0.5 rounded border border-[var(--border)] hover:bg-[var(--card-hover)] ${pinned ? 'text-[var(--cinnabar)]' : ''}`}
              aria-pressed={pinned}
              onClick={() => setPinned(v => !v)}
            >
              对照原图
            </button>
          )}
          {calibrateUrl && (
            <Link
              href={calibrateUrl}
              className="px-2 py-0.5 rounded border border-[var(--border)] hover:bg-[var(--card-hover)] hover:text-[var(--accent)]"
            >
              校定
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
