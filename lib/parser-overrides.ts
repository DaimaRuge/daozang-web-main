/**
 * 解析结果人工校正层（overrides，仅服务端）。
 *
 * 与解析器的关系：规则解析器给出低置信度标记后，人工在 /review 页
 * 逐块确认或改判，结果落盘到 data/parser-overrides.json。
 * 阅读页解析完成后叠加这层校正 —— 规则与人工判断分离存储：
 * 解析器规则升级不会丢失人工成果，人工校正也不会污染规则代码。
 *
 * 稳定键设计：块 ID（bookId-bN）依赖块序号，解析规则一变就全部漂移，
 * 不能作为持久键。改用「原文行号 + 内容前 10 字」—— 只要原始文本不变
 * 就稳定，即使规则版本升级也能对上。
 */

import fs from 'fs';
import path from 'path';
import { ContentBlock, ContentBlockType, ParsedBook, LOW_CONFIDENCE } from './content-schema';
import { buildToc } from './text-parser';

export interface BlockOverride {
  type: ContentBlockType;
  level?: number;
  reviewedAt: number;
}

/** bookId → (稳定键 → 校正记录) */
export type OverridesFile = Record<string, Record<string, BlockOverride>>;

const OVERRIDES_PATH = path.join(process.cwd(), 'data', 'parser-overrides.json');

/** 块的稳定键：原文行号 + 内容前缀（规则版本无关） */
export function overrideKey(block: Pick<ContentBlock, 'sourceStart' | 'content'>): string {
  return `${block.sourceStart}:${block.content.slice(0, 10)}`;
}

// 模块级缓存：overrides 文件小（人工产出），进程内读一次即可；
// 保存 API 写入后会主动失效缓存
let cache: OverridesFile | null = null;

export function loadOverrides(): OverridesFile {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf-8')) as OverridesFile;
  } catch {
    cache = {};
  }
  return cache;
}

/** 保存单条人工校正（传 null 撤销），由 /api/review 调用（仅开发环境） */
export function saveOverride(bookId: string, key: string, override: BlockOverride | null): void {
  const all = loadOverrides();
  const book = all[bookId] ?? {};
  if (override) book[key] = override;
  else delete book[key];
  if (Object.keys(book).length > 0) all[bookId] = book;
  else delete all[bookId];

  fs.mkdirSync(path.dirname(OVERRIDES_PATH), { recursive: true });
  fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(all, null, 2), 'utf-8');
  cache = all;
}

/**
 * 把人工校正叠加到解析结果上：命中的块改判为人工指定类型、
 * 置信度记满（人工判断即最终判断，parser 标记为 human-review），
 * 并重建目录与统计。
 */
export function applyOverrides(
  parsed: ParsedBook,
  // 默认读盘；测试时可注入，避免依赖文件系统
  bookOverrides: Record<string, BlockOverride> | undefined = loadOverrides()[parsed.bookId],
): ParsedBook {
  if (!bookOverrides || Object.keys(bookOverrides).length === 0) return parsed;

  let touched = 0;
  const blocks = parsed.blocks.map(b => {
    const o = bookOverrides[overrideKey(b)];
    if (!o) return b;
    touched++;
    return { ...b, type: o.type, level: o.level, confidence: 1, parser: 'human-review' };
  });
  if (touched === 0) return parsed;

  return {
    ...parsed,
    blocks,
    toc: buildToc(blocks),
    stats: {
      ...parsed.stats,
      lowConfidenceBlocks: blocks.filter(b => b.confidence < LOW_CONFIDENCE).length,
    },
  };
}
