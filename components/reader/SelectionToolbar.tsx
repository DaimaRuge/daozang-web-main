'use client';

/**
 * 划词工具条：用户在正文中选中文字后浮现。
 *
 * 为什么拆成独立组件：这是「Web as Agent」最重要的交互插槽 ——
 * 划词是收藏、笔记、AI 解释三类能力的共同入口。
 * 工具条只负责呈现动作按钮，具体行为（收藏、开笔记框、调 Agent）
 * 由父组件注入，未来新增「现代汉语释义」「生成引用卡片」等动作
 * 只需加一个按钮回调，不涉及选区计算逻辑改动。
 */
export interface SelectionInfo {
  text: string;
  blockId?: string;
  /** 工具条定位（相对文档） */
  top: number;
  left: number;
}

export default function SelectionToolbar({
  selection,
  onCopy,
  onBookmark,
  onNote,
  onAskAI,
  onTranslate,
  onIllustrate,
}: {
  selection: SelectionInfo;
  onCopy: () => void;
  onBookmark: () => void;
  onNote: () => void;
  /** AI 能力尚未接入时传 undefined，按钮呈禁用态而非隐藏（让用户知道能力即将到来） */
  onAskAI?: () => void;
  /** AI 现代汉语转写，同上 */
  onTranslate?: () => void;
  /** AI 生成插图 */
  onIllustrate?: () => void;
}) {
  const btn =
    'px-3 py-1.5 text-xs whitespace-nowrap hover:bg-[var(--card-hover)] transition-colors first:rounded-l-lg last:rounded-r-lg';

  return (
    <div
      role="toolbar"
      aria-label="选中文本操作"
      className="absolute z-40 flex bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-[var(--shadow-soft)] animate-fade-in"
      style={{ top: selection.top, left: selection.left }}
      // 阻止 mousedown 清空选区，保证按钮点击时选中内容仍有效
      onMouseDown={e => e.preventDefault()}
    >
      <button className={btn} onClick={onCopy}>复制</button>
      <button className={`${btn} border-l border-[var(--border)]`} onClick={onBookmark}>收藏</button>
      <button className={`${btn} border-l border-[var(--border)]`} onClick={onNote}>笔记</button>
      <button
        className={`${btn} border-l border-[var(--border)] ${onIllustrate ? '' : 'opacity-40 cursor-not-allowed'}`}
        onClick={onIllustrate}
        disabled={!onIllustrate}
        title={onIllustrate ? 'AI 生成插图' : 'AI 插图功能即将上线'}
      >
        插图
      </button>
      <button
        className={`${btn} border-l border-[var(--border)] ${onTranslate ? '' : 'opacity-40 cursor-not-allowed'}`}
        onClick={onTranslate}
        disabled={!onTranslate}
        title={onTranslate ? 'AI 转写为现代汉语' : 'AI 译文功能即将上线'}
      >
        译文
      </button>
      <button
        className={`${btn} border-l border-[var(--border)] ${onAskAI ? 'text-[var(--cinnabar)]' : 'opacity-40 cursor-not-allowed'}`}
        onClick={onAskAI}
        disabled={!onAskAI}
        title={onAskAI ? '向 AI 询问此段' : '智能问道功能即将上线'}
      >
        问道
      </button>
    </div>
  );
}
