/**
 * 缺图候选的共享类型。
 *
 * 候选是解析结果的 sidecar：原文与 ContentBlock 都不改写，
 * 用与 parser-overrides 相同的稳定键对齐位置。
 */

export type IllustrationSignal = 'heading-slot' | 'inline-ref' | 'title-tu';
export type IllustrationKind = 'seal' | 'talisman' | 'palm' | 'plate' | 'unknown';

export interface IllustrationCandidate {
  id: string;
  bookId: string;
  title: string;
  collection: string;
  category: string;
  subcategory: string;
  author?: string;
  volumeTitle?: string;
  volumeBlockId?: string;
  anchorKey: string;
  blockId?: string;
  sourceStart: number;
  sourceEnd: number;
  signal: IllustrationSignal;
  kind: IllustrationKind;
  confidence: number;
  clue: string;
  excerpt: string;
  /** 占位框标题：优先用章题（伏魔神印），否则用线索原文 */
  slotLabel: string;
  readerHref: string;
  state: 'open';
  /** 已被本槽吸收的短行线索，demo 用占位框代替这些块 */
  hideAnchorKeys?: string[];
}

export interface IllustrationPlacement {
  candidate: IllustrationCandidate;
  afterBlockId?: string;
  beforeBlockId?: string;
  hideBlockIds: string[];
}

export interface IllustrationCatalog {
  version: 1;
  scannedAt: string;
  parser: string;
  stats: { booksScanned: number; candidates: number; skipped: number };
  candidates: IllustrationCandidate[];
}

export interface BookIllustrationMeta {
  id: string;
  title: string;
  collection: string;
  category: string;
  subcategory: string;
  author?: string;
}
