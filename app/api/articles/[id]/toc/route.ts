import { NextResponse } from 'next/server';
import { getEnrichedToc, loadParsedBook } from '@/lib/book-content';
import { paginateBlocks } from '@/lib/book-pagination';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PRD §5：目录树，每项含 pageId（1-based 页码） */
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const parsed = loadParsedBook(id);
  if (!parsed) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const toc = getEnrichedToc(id);
  const totalPages = paginateBlocks(parsed.blocks).length;

  return NextResponse.json({
    bookId: id,
    title: parsed.title,
    totalPages,
    toc,
  });
}
