'use client';

import {
  FootnoteIndex,
  resolveFootnoteTarget,
  splitInlineNoteRefs,
} from '@/lib/footnotes';

/**
 * 带校勘脚注链接的行内文本渲染。
 *
 * 正统道藏底本以 #N 关联正文与校勘条目；本组件是唯一转换点，
 * 阅读器各块类型（正文、标题、注疏）复用，避免在 BlockRenderer 内重复解析。
 */
export default function InlineText({
  content,
  blockId,
  footnoteIndex,
  onFootnoteNavigate,
}: {
  content: string;
  blockId: string;
  footnoteIndex?: FootnoteIndex;
  /** 点击脚注后滚动定位并高亮目标块 */
  onFootnoteNavigate?: (targetBlockId: string) => void;
}) {
  const segments = splitInlineNoteRefs(content);
  if (segments.length === 1 && segments[0].kind === 'text') {
    return <>{content}</>;
  }

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === 'text') {
          return <span key={i}>{seg.value}</span>;
        }
        const target = footnoteIndex
          ? resolveFootnoteTarget(footnoteIndex, blockId, seg.num)
          : null;
        if (!target) {
          return (
            <sup key={i} className="note-ref note-ref-orphan" title="暂无对应校勘条目">
              {seg.num}
            </sup>
          );
        }
        return (
          <sup key={i}>
            <a
              href={`#${target}`}
              className="note-ref"
              title={`校勘 #${seg.num}`}
              onClick={e => {
                e.preventDefault();
                if (onFootnoteNavigate) {
                  onFootnoteNavigate(target);
                } else {
                  document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  window.history.replaceState(null, '', `#${target}`);
                }
              }}
            >
              {seg.num}
            </a>
          </sup>
        );
      })}
    </>
  );
}
