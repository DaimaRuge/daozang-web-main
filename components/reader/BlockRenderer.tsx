import Image from 'next/image';
import { ContentBlock, LOW_CONFIDENCE } from '@/lib/content-schema';

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
 * - AI 解释类型（ai-explanation）预留了显式标注样式，绝不与原文混排。
 */
export default function BlockRenderer({
  blocks,
  showEditorNotes,
}: {
  blocks: ContentBlock[];
  showEditorNotes: boolean;
}) {
  return (
    <>
      {blocks.map(block => {
        const lowConf = block.confidence < LOW_CONFIDENCE ? ' block-low-confidence' : '';
        const common = {
          id: block.id,
          'data-block-id': block.id,
        };

        switch (block.type) {
          case 'heading':
            return block.level === 1 ? (
              <h2 key={block.id} {...common} className={`block-heading-1${lowConf}`}>{block.content}</h2>
            ) : (
              <h3 key={block.id} {...common} className={`block-heading-2${lowConf}`}>{block.content}</h3>
            );
          case 'subheading':
            // level 4 是正文内的小节标签（如「呪曰」「頌曰」），
            // 视觉上弱于章节标题，且不参与目录
            if (block.level === 4) {
              return <p key={block.id} {...common} className={`block-say-label${lowConf}`}>{block.content}</p>;
            }
            return <h4 key={block.id} {...common} className={`block-subheading${lowConf}`}>{block.content}</h4>;
          case 'verse':
            return <div key={block.id} {...common} className={`block-verse${lowConf}`}>{block.content}</div>;
          case 'quote':
            return <blockquote key={block.id} {...common} className={`block-quote${lowConf}`}>{block.content}</blockquote>;
          case 'editor-note':
            // 整理者按语默认可显示，用户可在阅读设置中隐藏
            if (!showEditorNotes) return null;
            return (
              <aside key={block.id} {...common} className="block-editor-note">
                <span className="opacity-60 mr-1">〔按〕</span>{block.content}
              </aside>
            );
          case 'annotation':
          case 'original-note':
          case 'commentary':
            return <p key={block.id} {...common} className={`block-annotation${lowConf}`}>{block.content}</p>;
          case 'separator':
            return <hr key={block.id} {...common} className="block-separator" />;
          case 'image':
            // 科仪示意图等 AI 生成配图：与原文分区展示，图注单独成块
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
                {block.content}
              </figcaption>
            );
          case 'ai-explanation':
            // AI 内容必须显式标注来源属性，与经文原文严格区分
            return (
              <aside key={block.id} {...common} className="block-editor-note">
                <span className="text-[var(--cinnabar)] mr-1">〔AI 解释〕</span>{block.content}
              </aside>
            );
          default:
            return <p key={block.id} {...common} className={`block-paragraph${lowConf}`}>{block.content}</p>;
        }
      })}
    </>
  );
}
