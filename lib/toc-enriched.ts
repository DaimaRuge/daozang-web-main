import { TocItem, ContentBlock } from './content-schema';
import { BookPage, findPageForBlockId } from './book-pagination';

/** 目录项 + 分页定位（PRD §5：叶子节点绑定 page_id） */
export interface EnrichedTocItem extends TocItem {
  /** 0-based 页索引 */
  pageIndex: number;
  /** 1-based 页码，与 URL/API 一致 */
  pageId: number;
}

export function enrichTocWithPages(
  toc: TocItem[],
  blocks: ContentBlock[],
  pages: BookPage[],
): EnrichedTocItem[] {
  return toc.map(item => {
    const pageIndex = findPageForBlockId(pages, blocks, item.blockId);
    return {
      ...item,
      pageIndex,
      pageId: pageIndex + 1,
    };
  });
}
