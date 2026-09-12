import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getContentById, getEntryById } from '@/lib/data';
import { parseText } from '@/lib/text-parser';
import { detectIllustrationCandidates } from '@/lib/illustrations/detect-candidates';
import { catalogBooksWithSlots, loadIllustrationCatalog } from '@/lib/illustrations/catalog';
import { placeCandidates } from '@/lib/illustrations/place';
import TypographyDemo from './TypographyDemo';

/**
 * 缺图排版试验（仅开发环境默认开放）。
 * 当前书现场检测；全库书目下拉来自扫描 JSON。正式阅读页不插入占位。
 */

const DEMO_ENABLED = process.env.NODE_ENV !== 'production' || process.env.DZ_ENABLE_DEMO === '1';
const DEFAULT_BOOK = 'daaed8b692da3daf';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '缺图排版试验',
};

interface PageProps {
  searchParams: Promise<{ book?: string; slot?: string }>;
}

export default async function TypographyDemoPage({ searchParams }: PageProps) {
  if (!DEMO_ENABLED) notFound();

  const { book, slot } = await searchParams;
  const bookId = book || DEFAULT_BOOK;
  const entry = getEntryById(bookId);
  if (!entry) notFound();

  const parsed = parseText(getContentById(bookId), bookId, entry.title);
  const candidates = detectIllustrationCandidates(parsed, {
    id: entry.id,
    title: entry.title,
    collection: entry.collection,
    category: entry.category,
    subcategory: entry.subcategory,
    author: entry.author,
  });

  const catalog = loadIllustrationCatalog();
  const catalogBooks = catalogBooksWithSlots(catalog.candidates);
  const placements = placeCandidates(parsed.blocks, candidates);

  return (
    <TypographyDemo
      entry={{
        id: entry.id,
        title: entry.title,
        collection: entry.collection,
        category: entry.category,
        subcategory: entry.subcategory,
        author: entry.author,
      }}
      parsed={parsed}
      candidates={candidates}
      placements={placements}
      catalogBooks={catalogBooks}
      scanned={Boolean(catalog.scannedAt)}
      initialSlot={slot}
    />
  );
}
