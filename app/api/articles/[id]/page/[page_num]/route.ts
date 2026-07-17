import { NextRequest, NextResponse } from 'next/server';
import { getBookPages, pageNumToIndex } from '@/lib/book-content';
import { findVolumeForBlockIndex } from '@/lib/book-pagination';

interface RouteParams {
  params: Promise<{ id: string; page_num: string }>;
}

/**
 * PRD §5：GET /api/articles/{id}/page/{page_num}?volume=X
 * page_num 为 1-based；volume 为卷次 blockId（可选）
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id, page_num: pageNumStr } = await params;
  const pageNum = parseInt(pageNumStr, 10);
  if (Number.isNaN(pageNum) || pageNum < 1) {
    return NextResponse.json({ error: 'invalid page_num' }, { status: 400 });
  }

  const data = getBookPages(id);
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { parsed, pages } = data;
  const pageIndex = pageNumToIndex(pageNum, pages.length);
  if (pageIndex < 0) {
    return NextResponse.json({ error: 'page out of range', totalPages: pages.length }, { status: 404 });
  }

  const volumeParam = req.nextUrl.searchParams.get('volume');
  const page = pages[pageIndex];
  const volume = findVolumeForBlockIndex(parsed.toc, page.startBlockIndex, parsed.blocks);

  if (volumeParam && volume.blockId && volumeParam !== volume.blockId) {
    return NextResponse.json(
      { error: 'volume mismatch', expectedVolume: volume.blockId, pageNum },
      { status: 409 },
    );
  }

  const blocks = parsed.blocks.slice(page.startBlockIndex, page.endBlockIndex + 1);

  return NextResponse.json({
    bookId: id,
    title: parsed.title,
    pageNum,
    pageIndex,
    totalPages: pages.length,
    volumeBlockId: volume.blockId,
    volumeTitle: volume.title,
    blocks,
    prevPageNum: pageNum > 1 ? pageNum - 1 : null,
    nextPageNum: pageNum < pages.length ? pageNum + 1 : null,
  });
}
