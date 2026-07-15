/**
 * 科仪示意图注入层（仅服务端）。
 *
 * 工作流：LLM 解读科仪段落 → libtv 生成示意图 → 落盘 data/ritual-illustrations.json
 * → 阅读页解析后在此叠加 image / image-caption 块，插入在原文锚点之后。
 *
 * 内容边界：示意图为 AI 生成辅助理解，必须标注来源，绝不替代或混入原文。
 * 稳定键与 parser-overrides 相同（原文行号 + 内容前缀），规则升级不漂移。
 */

import fs from 'fs';
import path from 'path';
import { ContentBlock, ParsedBook } from './content-schema';
import { overrideKey } from './parser-overrides';

export interface RitualIllustration {
  /** 图片 URL（相对站点根路径） */
  image: string;
  /** 图注说明 */
  caption: string;
  /** 插入位置：锚点块之后 */
  position: 'after';
  aiGenerated: true;
}

/** bookId → (稳定键 → 示意图) */
export type RitualIllustrationsFile = Record<string, Record<string, RitualIllustration>>;

const MANIFEST_PATH = path.join(process.cwd(), 'data', 'ritual-illustrations.json');

let cache: RitualIllustrationsFile | null = null;

export function loadRitualIllustrations(): RitualIllustrationsFile {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as RitualIllustrationsFile;
  } catch {
    cache = {};
  }
  return cache;
}

/** 在解析结果中注入科仪示意图块（插在锚点块之后） */
export function injectRitualIllustrations(parsed: ParsedBook): ParsedBook {
  const bookIllus = loadRitualIllustrations()[parsed.bookId];
  if (!bookIllus || Object.keys(bookIllus).length === 0) return parsed;

  const blocks: ContentBlock[] = [];
  let injected = 0;

  for (const block of parsed.blocks) {
    blocks.push(block);
    const illus = bookIllus[overrideKey(block)];
    if (!illus || illus.position !== 'after') continue;

    const imgId = `${block.id}-illus`;
    blocks.push({
      id: imgId,
      type: 'image',
      content: illus.image,
      sourceStart: block.sourceStart,
      sourceEnd: block.sourceEnd,
      confidence: 1,
      parser: 'ritual-illus',
    });
    blocks.push({
      id: `${imgId}-cap`,
      type: 'image-caption',
      content: illus.caption,
      sourceStart: block.sourceStart,
      sourceEnd: block.sourceEnd,
      confidence: 1,
      parser: 'ritual-illus',
    });
    injected++;
  }

  if (injected === 0) return parsed;
  return {
    ...parsed,
    blocks,
    stats: { ...parsed.stats, totalBlocks: blocks.length },
  };
}
