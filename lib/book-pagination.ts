import { ContentBlock, TocItem } from './content-schema';

/** 单页元数据：按自然段落切分，不截断块 */
export interface BookPage {
  index: number;
  startBlockIndex: number;
  endBlockIndex: number;
  blockIds: string[];
  charCount: number;
}

const TARGET_CHARS = 1400;
const MAX_CHARS = 2200;

function slicePage(index: number, start: number, end: number, blocks: ContentBlock[]): BookPage {
  const slice = blocks.slice(start, end + 1);
  return {
    index,
    startBlockIndex: start,
    endBlockIndex: end,
    blockIds: slice.map(b => b.id),
    charCount: slice.reduce((n, b) => n + b.content.length, 0),
  };
}

/** 将结构化块切分为书页（heading/subheading 优先作为页界） */
export function paginateBlocks(blocks: ContentBlock[]): BookPage[] {
  if (blocks.length === 0) {
    return [{ index: 0, startBlockIndex: 0, endBlockIndex: 0, blockIds: [], charCount: 0 }];
  }

  const pages: BookPage[] = [];
  let start = 0;
  let accum = 0;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    accum += b.content.length;
    const isHeading = b.type === 'heading' || b.type === 'subheading';

    if (i > start && accum >= TARGET_CHARS && isHeading) {
      pages.push(slicePage(pages.length, start, i - 1, blocks));
      start = i;
      accum = b.content.length;
      continue;
    }

    if (accum >= MAX_CHARS && i > start) {
      pages.push(slicePage(pages.length, start, i, blocks));
      start = i + 1;
      accum = 0;
    }
  }

  if (start < blocks.length) {
    pages.push(slicePage(pages.length, start, blocks.length - 1, blocks));
  }

  return pages;
}

export function findBlockIndex(blocks: ContentBlock[], blockId: string): number {
  return blocks.findIndex(b => b.id === blockId);
}

export function findPageForBlockId(pages: BookPage[], blocks: ContentBlock[], blockId: string): number {
  const idx = findBlockIndex(blocks, blockId);
  if (idx < 0) return 0;
  const page = pages.find(p => idx >= p.startBlockIndex && idx <= p.endBlockIndex);
  return page?.index ?? 0;
}

/** 当前页所属卷次（toc level 2） */
export function findVolumeForBlockIndex(toc: TocItem[], blockIndex: number, blocks: ContentBlock[]): {
  blockId?: string;
  title?: string;
} {
  let volume: TocItem | undefined;
  for (const item of toc) {
    if (item.level > 2) continue;
    const itemIdx = findBlockIndex(blocks, item.blockId);
    if (itemIdx >= 0 && itemIdx <= blockIndex) {
      if (item.level === 2 || !volume) volume = item;
    }
  }
  return volume ? { blockId: volume.blockId, title: volume.title } : {};
}

export function pageFromLegacyScroll(scrollProgress: number, totalPages: number): number {
  if (totalPages <= 1) return 0;
  return Math.min(totalPages - 1, Math.max(0, Math.floor(scrollProgress * totalPages)));
}
