/**
 * 底本校勘脚注（#N / ＃N）解析与索引。
 *
 * 正统道藏数字化底本在正文内以 #133 形式标注，对应文末或卷末
 * 「#133東井識：……」式校勘条目。阅读器需将二者关联为可跳转链接，
 * 而非裸露数字。卷次切换时脚注编号会重置，索引按「卷界」分域。
 */

import { ContentBlock } from './content-schema';

/** 行内或条目开头的脚注编号（半角 # 与全角 ＃ 均支持） */
export const NOTE_NUM_RE = /[#＃](\d+)/g;

/** 整段是否为校勘脚注条目（以 #N 起首） */
const FOOTNOTE_DEF_START_RE = /^[\s\u3000]*(?:[#＃]\d+)+/;

/** 卷标题：脚注编号域在此处分界重置 */
const VOLUME_SCOPE_RE = /^.{0,20}?卷(之[一二三四五六七八九十百千0-9０-９]+|[一二三四五六七八九十百千0-9０-９]+|[上中下])$/;

export interface FootnoteDefinition {
  /** 本条校勘对应的编号（#6#23 式合并条目会有多个） */
  nums: number[];
  /** 去掉编号前缀后的条目正文 */
  body: string;
}

export interface FootnoteIndex {
  /** 每个内容块所属的脚注域（按卷界递增） */
  blockScope: Map<string, number>;
  /** 域 index → (编号 → 校勘条目 blockId) */
  scopes: Map<number, Map<number, string>>;
}

export type InlineSegment =
  | { kind: 'text'; value: string }
  | { kind: 'ref'; value: string; num: number };

/** 判断块是否为卷标题，用作脚注域边界 */
export function isVolumeScopeBoundary(block: ContentBlock): boolean {
  return block.type === 'heading' && block.level === 2 && VOLUME_SCOPE_RE.test(block.content);
}

/** 判断一行文本是否为校勘脚注条目（#133東井識：…） */
export function isFootnoteDefinition(content: string): boolean {
  return FOOTNOTE_DEF_START_RE.test(content);
}

/** 解析校勘脚注条目，提取编号与正文 */
export function parseFootnoteDefinition(content: string): FootnoteDefinition | null {
  const m = content.match(/^[\s\u3000]*((?:[#＃]\d+)+)([\s　]*)(.*)$/);
  if (!m) return null;
  const nums = [...m[1].matchAll(/[#＃](\d+)/g)].map(x => parseInt(x[1], 10));
  const body = (m[3] || '').trimStart();
  if (nums.length === 0) return null;
  return { nums, body };
}

/** 将含 #N 的字符串拆成文本段与脚注引用段，供 React 渲染 */
export function splitInlineNoteRefs(content: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let last = 0;
  for (const m of content.matchAll(NOTE_NUM_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) {
      segments.push({ kind: 'text', value: content.slice(last, idx) });
    }
    segments.push({ kind: 'ref', value: m[0], num: parseInt(m[1], 10) });
    last = idx + m[0].length;
  }
  if (last < content.length) {
    segments.push({ kind: 'text', value: content.slice(last) });
  }
  return segments;
}

/**
 * 扫描全书块列表，建立「卷域 × 编号 → 校勘条目 blockId」索引。
 * 同一卷内 #6#23 合并条目会同时注册 6 与 23。
 */
export function buildFootnoteIndex(blocks: ContentBlock[]): FootnoteIndex {
  const blockScope = new Map<string, number>();
  const scopes = new Map<number, Map<number, string>>();
  let scope = 0;
  scopes.set(scope, new Map());

  for (const block of blocks) {
    if (isVolumeScopeBoundary(block)) {
      scope += 1;
      if (!scopes.has(scope)) scopes.set(scope, new Map());
    }
    blockScope.set(block.id, scope);

    if (!isFootnoteDefinition(block.content)) continue;
    const def = parseFootnoteDefinition(block.content);
    if (!def) continue;
    const map = scopes.get(scope)!;
    for (const num of def.nums) {
      map.set(num, block.id);
    }
  }

  return { blockScope, scopes };
}

/** 解析行内 #N 应跳转的目标 blockId；无对应条目时返回 null */
export function resolveFootnoteTarget(
  index: FootnoteIndex,
  blockId: string,
  num: number,
): string | null {
  const scope = index.blockScope.get(blockId);
  if (scope === undefined) return null;
  return index.scopes.get(scope)?.get(num) ?? null;
}
