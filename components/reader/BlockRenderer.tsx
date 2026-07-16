import Image from 'next/image';
import { ContentBlock, LOW_CONFIDENCE } from '@/lib/content-schema';
import {
  FootnoteIndex,
  isFootnoteDefinition,
  parseFootnoteDefinition,
} from '@/lib/footnotes';
import InlineText from './InlineText';

/**
 * 内容块渲染器。
 *
 * 为什么单独拆出来：这是「结构化文本 → 视觉呈现」的唯一转换点，
 * 阅读器、未来的搜索结果预览、引用卡片、AI 引用展示都复用它；
 * 新增块类型（图片、表格、AI 解释）只需在此扩展分支，
 * 阅读器主体（滚动、设置、选中逻辑）完全不用动。
 *
 * 渲染原则：
 * - 每个块携带 id 锚点与 data-block-id，供目录定位、进度追踪与划词溯源；
 * - 低置信度块加待审核样式，向用户诚实展示「此结构为机器识别」；
 * - AI 解释类型（ai-explanation）预留了显式标注样式，绝不与原文混排；
 * - 底本校勘 #N 通过 InlineText 转为可跳转链接，校勘条目单独成块展示。
 */
export default function BlockRenderer({
  blocks,
  showEditorNotes,
  footnoteIndex,
  onFootnoteNavigate,
}: {
  blocks: ContentBlock[];
  showEditorNotes: boolean;
  footnoteIndex?: FootnoteIndex;
  onFootnoteNavigate?: (targetBlockId: string) => void;
}) {
  /** 含 #N 的文本统一走 InlineText，标题/正文/注疏均适用 */
  const renderText = (block: ContentBlock, content: string) => (
    <InlineText
      content={content}
      blockId={block.id}
      footnoteIndex={footnoteIndex}
      onFootnoteNavigate={onFootnoteNavigate}
    />
  );

  /** 校勘脚注条目：弱化于原文、强于裸段落，编号徽章 + 条目正文 */
  const renderFootnoteDef = (block: ContentBlock) => {
    const def = parseFootnoteDefinition(block.content);
    const lowConf = block.confidence < LOW_CONFIDENCE ? ' block-low-confidence' : '';
    const common = { id: block.id, 'data-block-id': block.id };

    return (
      <aside key={block.id} {...common} className={`block-footnote-def${lowConf}`}>
        {def?.nums.map(n => (
          <span key={n} className="footnote-def-badge" aria-hidden>
            {n}
          </span>
        ))}
        <span>{def?.body ?? block.content}</span>
      </aside>
    );
  };

  return (
    <>
      {blocks.map(block => {
        const lowConf = block.confidence < LOW_CONFIDENCE ? ' block-low-confidence' : '';
        const common = {
          id: block.id,
          'data-block-id': block.id,
        };

        // 校勘条目优先于 type 分发：解析器尚未单独分型时也能正确展示
        if (isFootnoteDefinition(block.content)) {
          return renderFootnoteDef(block);
        }

        switch (block.type) {
          case 'heading':
            return block.level === 1 ? (
              <h2 key={block.id} {...common} className={`block-heading-1${lowConf}`}>
                {renderText(block, block.content)}
              </h2>
            ) : (
              <h3 key={block.id} {...common} className={`block-heading-2${lowConf}`}>
                {renderText(block, block.content)}
              </h3>
            );
          case 'subheading':
            if (block.level === 4) {
              return (
                <p key={block.id} {...common} className={`block-say-label${lowConf}`}>
                  {renderText(block, block.content)}
                </p>
              );
            }
            return (
              <h4 key={block.id} {...common} className={`block-subheading${lowConf}`}>
                {renderText(block, block.content)}
              </h4>
            );
          case 'verse':
            return (
              <div key={block.id} {...common} className={`block-verse${lowConf}`}>
                {renderText(block, block.content)}
              </div>
            );
          case 'quote':
            return (
              <blockquote key={block.id} {...common} className={`block-quote${lowConf}`}>
                {renderText(block, block.content)}
              </blockquote>
            );
          case 'editor-note':
            if (!showEditorNotes) return null;
            return (
              <aside key={block.id} {...common} className="block-editor-note">
                <span className="opacity-60 mr-1">〔按〕</span>
                {renderText(block, block.content)}
              </aside>
            );
          case 'annotation':
          case 'original-note':
          case 'commentary':
            return (
              <p key={block.id} {...common} className={`block-annotation${lowConf}`}>
                {renderText(block, block.content)}
              </p>
            );
          case 'separator':
            return <hr key={block.id} {...common} className="block-separator" />;
          case 'image':
            return (
              <figure key={block.id} {...common} className="block-image my-6">
                <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--card)]">
                  <Image
                    src={block.content}
                    alt="科仪示意图"
                    fill
                    sizes="(max-width: 768px) 100vw, 640px"
                    className="object-contain p-2"
                  />
                </div>
              </figure>
            );
          case 'image-caption':
            return (
              <figcaption key={block.id} {...common} className="block-image-caption">
                <span className="text-[var(--cinnabar)] mr-1">〔示意图 · AI 生成〕</span>
                {renderText(block, block.content)}
              </figcaption>
            );
          case 'ai-explanation':
            return (
              <aside key={block.id} {...common} className="block-editor-note">
                <span className="text-[var(--cinnabar)] mr-1">〔AI 解释〕</span>
                {renderText(block, block.content)}
              </aside>
            );
          default:
            return (
              <p key={block.id} {...common} className={`block-paragraph${lowConf}`}>
                {renderText(block, block.content)}
              </p>
            );
        }
      })}
    </>
  );
}
