import { NextResponse } from 'next/server';
import { getContentById, getEntryById } from '@/lib/data';
import { parseText } from '@/lib/text-parser';
import { applyOverrides } from '@/lib/parser-overrides';
import { injectRitualIllustrations } from '@/lib/ritual-illustrations';
import { paginateBlocks, findVolumeForBlockIndex } from '@/lib/book-pagination';

interface RouteParams {
  params: Promise<{ id: string; page: string }>;
}

/** GET /api/content/{id}/pages/{page} — 分页正文片段（0-based page） */
export async function GET(_req: Request, { params }: RouteParams) {
  const { id, page: pageParam } = await params;
  const pageIndex = parseInt(pageParam, 10);
  if (Number.isNaN(pageIndex) || pageIndex < 0) {
    return NextResponse.json({ error: 'invalid page' }, { status: 400 });
  }

  const entry = getEntryById(id);
  if (!entry) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const content = getContentById(id);
  const parsed = injectRitualIllustrations(
    applyOverrides(parseText(content, id, entry.title)),
  );
  const pages = paginateBlocks(parsed.blocks);

  if (pageIndex >= pages.length) {
    return NextResponse.json({ error: 'page out of range' }, { status: 404 });
  }

  const page = pages[pageIndex];
  const blocks = parsed.blocks.slice(page.startBlockIndex, page.endBlockIndex + 1);
  const volume = findVolumeForBlockIndex(parsed.toc, page.startBlockIndex, parsed.blocks);

  return NextResponse.json({
    bookId: id,
    title: entry.title,
    pageIndex: page.index,
    totalPages: pages.length,
    blocks,
    volumeBlockId: volume.blockId,
    volumeTitle: volume.title,
    prevPage: pageIndex > 0 ? pageIndex - 1 : null,
    nextPage: pageIndex < pages.length - 1 ? pageIndex + 1 : null,
  });
}
