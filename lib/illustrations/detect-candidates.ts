/**
 * 从结构化块序列识别缺图候选。
 *
 * 为什么不写进 text-parser：线索是 sidecar，规则加宽/收紧不应迫使
 * 解析器版本升级；正式阅读页也不能因为误检就插入 image 块。
 *
 * 同槽合并：heading-slot 为槽起点；「別本此印」短行与段首「右印/右符」
 * 吸附到最近前序同 kind 的槽，而不是用固定行距窗口
 * （短书会把多枚印合成一条）。
 */

import { ContentBlock, ParsedBook } from '../content-schema';
import { overrideKey } from '../parser-overrides';
import { findVolumeForBlockIndex } from '../book-pagination';
import { kindFromClue } from './kinds';
import type {
  BookIllustrationMeta,
  IllustrationCandidate,
  IllustrationKind,
  IllustrationSignal,
} from './candidates';

export type { BookIllustrationMeta, IllustrationCandidate } from './candidates';

const RIGHT_START = /^右(印|符|圖|图|式)/;
const DOC_FALSE = /^右(奉|關|关|牒|上|下)/;
const BIEBEN = /別本此(印|符|圖|图)/;
const PALM_EXACT = /^(訣目掌圓|诀目掌圆|掌圓|掌圆|掌圖|掌图)$/;
const TU_INLINE =
  /如[左右][圖图]|其[圖图]如[後后]|[圖图]曰|[圖图印](缺|佚|亡)|[【〔［][圖图][】〕］]/;

function isHeading(block: ContentBlock): boolean {
  return block.type === 'heading' || block.type === 'subheading';
}

function isVolumeEnd(text: string): boolean {
  return /竟$/.test(text);
}

function isRightClue(text: string): boolean {
  return RIGHT_START.test(text) && !DOC_FALSE.test(text);
}

function isBiebenLine(text: string): boolean {
  return BIEBEN.test(text) && text.length <= 16;
}

function matchClue(text: string): string | null {
  const m =
    text.match(/別本此(?:印|符|圖|图)/)?.[0] ||
    text.match(/^右(?:印|符|圖|图|式)/)?.[0] ||
    text.match(PALM_EXACT)?.[0] ||
    text.match(/如[左右][圖图]|其[圖图]如[後后]|[圖图]曰|[圖图印](?:缺|佚|亡)|[【〔［][圖图][】〕］]/)?.[0];
  return m ?? null;
}

interface RawHit {
  index: number;
  signal: IllustrationSignal;
  clue: string;
  kind: IllustrationKind;
  confidence: number;
  slotStart: boolean;
}

function collectHits(blocks: ContentBlock[]): RawHit[] {
  const hits: RawHit[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const text = block.content;
    const next = blocks[i + 1];

    if (isHeading(block) && !isVolumeEnd(text) && next && !isVolumeEnd(next.content)) {
      if (isRightClue(next.content) || isBiebenLine(next.content)) {
        const clue = matchClue(next.content) || text;
        hits.push({
          index: i,
          signal: 'heading-slot',
          clue,
          kind: kindFromClue(`${text}${clue}`),
          confidence: 0.9,
          slotStart: true,
        });
      }
    }

    if (PALM_EXACT.test(text)) {
      hits.push({
        index: i,
        signal: 'inline-ref',
        clue: text,
        kind: 'palm',
        confidence: 0.9,
        slotStart: true,
      });
    } else if (isBiebenLine(text)) {
      hits.push({
        index: i,
        signal: 'inline-ref',
        clue: matchClue(text) || text,
        kind: kindFromClue(text),
        confidence: 0.95,
        slotStart: false,
      });
    } else if (isRightClue(text) && !isHeading(block)) {
      hits.push({
        index: i,
        signal: 'inline-ref',
        clue: matchClue(text) || text.slice(0, 4),
        kind: kindFromClue(text),
        confidence: 0.85,
        slotStart: false,
      });
    } else if (TU_INLINE.test(text) && !isRightClue(text) && !isBiebenLine(text)) {
      hits.push({
        index: i,
        signal: 'inline-ref',
        clue: matchClue(text) || text.slice(0, 8),
        kind: kindFromClue(text),
        confidence: 0.88,
        slotStart: false,
      });
    }
  }

  return hits;
}

function mergeHits(hits: RawHit[]): RawHit[] {
  const starts = hits.filter(h => h.slotStart);
  const absorbed = new Set<number>();
  const hideByStart = new Map<number, number[]>();

  for (const hit of hits) {
    if (hit.slotStart) continue;
    let host: RawHit | undefined;
    for (const start of starts) {
      if (start.kind !== hit.kind) continue;
      if (start.index >= hit.index) continue;
      if (!host || start.index > host.index) host = start;
    }
    if (!host) {
      hit.slotStart = true;
      starts.push(hit);
      continue;
    }
    absorbed.add(hit.index);
    const list = hideByStart.get(host.index) ?? [];
    list.push(hit.index);
    hideByStart.set(host.index, list);
    host.confidence = Math.max(host.confidence, hit.confidence);
    if (hit.confidence >= host.confidence) host.clue = hit.clue;
  }

  return starts
    .filter(h => !absorbed.has(h.index))
    .map(h => ({ ...h, attached: hideByStart.get(h.index) ?? [] })) as (RawHit & { attached: number[] })[];
}

function excerptFor(blocks: ContentBlock[], host: number, attached: number[]): string {
  const idxs = [host, ...attached].sort((a, b) => a - b);
  return idxs
    .map(i => blocks[i]?.content.slice(0, 40))
    .filter(Boolean)
    .join(' / ');
}

function toCandidate(
  parsed: ParsedBook,
  meta: BookIllustrationMeta,
  hit: RawHit & { attached: number[] },
): IllustrationCandidate {
  const block = parsed.blocks[hit.index];
  const hideAnchorKeys = hit.attached
    .map(i => parsed.blocks[i])
    .filter(b => b && (isBiebenLine(b.content) || PALM_EXACT.test(b.content)))
    .map(b => overrideKey(b));
  const vol = findVolumeForBlockIndex(parsed.toc, hit.index, parsed.blocks);
  const anchorKey = overrideKey(block);
  return {
    id: `${meta.id}:${anchorKey}:${hit.signal}`,
    bookId: meta.id,
    title: meta.title,
    collection: meta.collection,
    category: meta.category,
    subcategory: meta.subcategory,
    author: meta.author,
    volumeTitle: vol.title,
    volumeBlockId: vol.blockId,
    anchorKey,
    blockId: block.id,
    sourceStart: block.sourceStart,
    sourceEnd: block.sourceEnd,
    signal: hit.signal,
    kind: hit.kind,
    confidence: hit.confidence,
    clue: hit.clue,
    excerpt: excerptFor(parsed.blocks, hit.index, hit.attached),
    slotLabel: isHeading(block) ? block.content : hit.clue,
    readerHref: `/text/${meta.id}#${block.id}`,
    state: 'open',
    hideAnchorKeys: hideAnchorKeys.length > 0 ? hideAnchorKeys : undefined,
  };
}

function titleTuCandidate(meta: BookIllustrationMeta): IllustrationCandidate | null {
  if (!/[圖图]/.test(meta.title)) return null;
  return {
    id: `${meta.id}:book:title:title-tu`,
    bookId: meta.id,
    title: meta.title,
    collection: meta.collection,
    category: meta.category,
    subcategory: meta.subcategory,
    author: meta.author,
    anchorKey: 'book:title',
    sourceStart: 0,
    sourceEnd: 0,
    signal: 'title-tu',
    kind: 'plate',
    confidence: 0.7,
    clue: meta.title,
    excerpt: meta.title,
    slotLabel: meta.title,
    readerHref: `/text/${meta.id}`,
    state: 'open',
  };
}

export function detectIllustrationCandidates(
  parsed: ParsedBook,
  meta: BookIllustrationMeta,
): IllustrationCandidate[] {
  const merged = mergeHits(collectHits(parsed.blocks)) as (RawHit & { attached: number[] })[];
  const body = merged.map(hit => toCandidate(parsed, meta, hit));
  const seen = new Set<string>();
  const unique: IllustrationCandidate[] = [];
  for (const c of body) {
    const key = `${c.bookId}:${c.anchorKey}:${c.signal}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }
  const title = titleTuCandidate(meta);
  if (title) unique.push(title);
  return unique;
}

export function isShortClueBlock(block: ContentBlock): boolean {
  return isBiebenLine(block.content) || PALM_EXACT.test(block.content);
}