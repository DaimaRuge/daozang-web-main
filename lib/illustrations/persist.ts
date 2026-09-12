/**
 * 缺图候选的落库与审核台视图。
 *
 * JSON 仍是扫描产物；Postgres 是 CMS 队列。重复导入更新线索字段，
 * 但不把人工 state / resolved_anchor_id 打回 open。
 */

import { execute, query, queryOne } from '../pg';
import type { IllustrationCandidate, IllustrationKind, IllustrationSignal } from './candidates';

export interface IllustrationCandidateRow {
  id: string;
  book_id: string;
  title: string;
  collection: string | null;
  category: string | null;
  slot_label: string;
  reader_href: string;
  anchor_key: string;
  block_id: string | null;
  signal: string;
  confidence: number;
  excerpt: string | null;
  kind: string | null;
  clue: string | null;
  volume_title: string | null;
  volume_block_id: string | null;
  source_start: number | null;
  source_end: number | null;
  state: string;
  resolved_anchor_id: string | null;
  created_at: number;
}

export interface CandidateQueueItem {
  id: string;
  bookId: string;
  title: string;
  slotLabel: string;
  kind: IllustrationKind;
  signal: IllustrationSignal | string;
  confidence: number;
  clue: string;
  excerpt: string;
  category: string;
  volumeTitle?: string;
  readerHref: string;
  demoHref: string;
  state: string;
}

export interface QueueFilters {
  kind?: string;
  signal?: string;
  q?: string;
  state?: string;
}

export const UPSERT_CANDIDATE_SQL = `
INSERT INTO illustration_candidates (
  id, book_id, title, collection, category, slot_label, reader_href,
  anchor_key, block_id, signal, confidence, excerpt, kind, clue,
  volume_title, volume_block_id, source_start, source_end,
  state, resolved_anchor_id, created_at
) VALUES (
  $1,$2,$3,$4,$5,$6,$7,
  $8,$9,$10,$11,$12,$13,$14,
  $15,$16,$17,$18,
  $19,$20,$21
)
ON CONFLICT (id) DO UPDATE SET
  book_id = EXCLUDED.book_id,
  title = EXCLUDED.title,
  collection = EXCLUDED.collection,
  category = EXCLUDED.category,
  slot_label = EXCLUDED.slot_label,
  reader_href = EXCLUDED.reader_href,
  anchor_key = EXCLUDED.anchor_key,
  block_id = EXCLUDED.block_id,
  signal = EXCLUDED.signal,
  confidence = EXCLUDED.confidence,
  excerpt = EXCLUDED.excerpt,
  kind = EXCLUDED.kind,
  clue = EXCLUDED.clue,
  volume_title = EXCLUDED.volume_title,
  volume_block_id = EXCLUDED.volume_block_id,
  source_start = EXCLUDED.source_start,
  source_end = EXCLUDED.source_end
`;

export function candidateToRow(c: IllustrationCandidate): IllustrationCandidateRow {
  return {
    id: c.id,
    book_id: c.bookId,
    title: c.title,
    collection: c.collection || null,
    category: c.category || null,
    slot_label: c.slotLabel,
    reader_href: c.readerHref,
    anchor_key: c.anchorKey,
    block_id: c.blockId ?? null,
    signal: c.signal,
    confidence: c.confidence,
    excerpt: c.excerpt || null,
    kind: c.kind,
    clue: c.clue || null,
    volume_title: c.volumeTitle ?? null,
    volume_block_id: c.volumeBlockId ?? null,
    source_start: c.sourceStart,
    source_end: c.sourceEnd,
    state: c.state,
    resolved_anchor_id: null,
    created_at: Date.now(),
  };
}

export function candidateToQueueItem(c: IllustrationCandidate): CandidateQueueItem {
  const params = new URLSearchParams({ book: c.bookId });
  if (c.signal !== 'title-tu') params.set('slot', c.id);
  return {
    id: c.id,
    bookId: c.bookId,
    title: c.title,
    slotLabel: c.slotLabel,
    kind: c.kind,
    signal: c.signal,
    confidence: c.confidence,
    clue: c.clue,
    excerpt: c.excerpt,
    category: c.category,
    volumeTitle: c.volumeTitle,
    readerHref: c.readerHref || `/text/${c.bookId}`,
    demoHref: `/demo/typography?${params.toString()}`,
    state: c.state,
  };
}

export function filterCandidateQueue(
  candidates: IllustrationCandidate[],
  filters: QueueFilters = {},
): IllustrationCandidate[] {
  const q = filters.q?.trim().toLowerCase();
  return candidates.filter(c => {
    if (filters.state && c.state !== filters.state) return false;
    if (filters.kind && c.kind !== filters.kind) return false;
    if (filters.signal && c.signal !== filters.signal) return false;
    if (!q) return true;
    const blob = `${c.title} ${c.slotLabel} ${c.clue} ${c.excerpt} ${c.category}`.toLowerCase();
    return blob.includes(q);
  });
}

function rowParams(row: IllustrationCandidateRow): unknown[] {
  return [
    row.id,
    row.book_id,
    row.title,
    row.collection,
    row.category,
    row.slot_label,
    row.reader_href,
    row.anchor_key,
    row.block_id,
    row.signal,
    row.confidence,
    row.excerpt,
    row.kind,
    row.clue,
    row.volume_title,
    row.volume_block_id,
    row.source_start,
    row.source_end,
    row.state,
    row.resolved_anchor_id,
    row.created_at,
  ];
}

export async function upsertIllustrationCandidates(candidates: IllustrationCandidate[]): Promise<number> {
  let n = 0;
  for (const c of candidates) {
    n += await execute(UPSERT_CANDIDATE_SQL, rowParams(candidateToRow(c)));
  }
  return n;
}

function rowToCandidate(row: IllustrationCandidateRow): IllustrationCandidate {
  return {
    id: row.id,
    bookId: row.book_id,
    title: row.title || '',
    collection: row.collection || '',
    category: row.category || '',
    subcategory: '',
    volumeTitle: row.volume_title || undefined,
    volumeBlockId: row.volume_block_id || undefined,
    anchorKey: row.anchor_key,
    blockId: row.block_id || undefined,
    sourceStart: row.source_start ?? 0,
    sourceEnd: row.source_end ?? 0,
    signal: row.signal as IllustrationSignal,
    kind: (row.kind as IllustrationKind) || 'unknown',
    confidence: Number(row.confidence),
    clue: row.clue || '',
    excerpt: row.excerpt || '',
    slotLabel: row.slot_label || row.clue || '',
    readerHref: row.reader_href || `/text/${row.book_id}`,
    state: (row.state as IllustrationCandidate['state']) || 'open',
  };
}

export async function countImportedCandidates(): Promise<number> {
  const row = await queryOne<{ n: number }>('SELECT COUNT(*)::int AS n FROM illustration_candidates');
  return row?.n ?? 0;
}

export async function listIllustrationCandidatesFromDb(
  filters: QueueFilters = {},
): Promise<IllustrationCandidate[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (filters.state) add('state = ?', filters.state);
  if (filters.kind) add('kind = ?', filters.kind);
  if (filters.signal) add('signal = ?', filters.signal);
  if (filters.q?.trim()) {
    params.push(`%${filters.q.trim()}%`);
    const p = `$${params.length}`;
    where.push(
      `(title ILIKE ${p} OR slot_label ILIKE ${p} OR clue ILIKE ${p} OR excerpt ILIKE ${p} OR category ILIKE ${p})`,
    );
  }
  const sql = `SELECT * FROM illustration_candidates${
    where.length ? ` WHERE ${where.join(' AND ')}` : ''
  } ORDER BY confidence DESC, title, source_start NULLS LAST`;
  const rows = await query<IllustrationCandidateRow>(sql, params);
  return rows.map(rowToCandidate);
}
