/**
 * 缺图候选：JSON → 行映射、队列筛选、导入不覆盖人工 state。
 * 运行：npx tsx --test tests/illustration-import.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IllustrationCandidate } from '../lib/illustrations/candidates';
import {
  candidateToQueueItem,
  candidateToRow,
  filterCandidateQueue,
  UPSERT_CANDIDATE_SQL,
} from '../lib/illustrations/persist';
import { loadIllustrationCatalog } from '../lib/illustrations/catalog';

function sample(partial: Partial<IllustrationCandidate> = {}): IllustrationCandidate {
  return {
    id: 'daaed8b692da3daf:19:伏魔神印:heading-slot',
    bookId: 'daaed8b692da3daf',
    title: '靈寶凈明新修九老神印伏魔秘法',
    collection: '正统道藏',
    category: '洞玄部',
    subcategory: '方法類',
    volumeTitle: '靈寶淨明新修九老神印伏魔秘法',
    volumeBlockId: 'b1',
    anchorKey: '19:伏魔神印',
    blockId: 'daaed8b692da3daf-b19',
    sourceStart: 19,
    sourceEnd: 19,
    signal: 'heading-slot',
    kind: 'seal',
    confidence: 0.95,
    clue: '別本此印',
    excerpt: '伏魔神印 / 別本此印',
    slotLabel: '伏魔神印',
    readerHref: '/text/daaed8b692da3daf#daaed8b692da3daf-b19',
    state: 'open',
    ...partial,
  };
}

test('candidateToRow 带上书目、占位名与阅读链接', () => {
  const row = candidateToRow(sample());
  assert.equal(row.id, 'daaed8b692da3daf:19:伏魔神印:heading-slot');
  assert.equal(row.book_id, 'daaed8b692da3daf');
  assert.equal(row.slot_label, '伏魔神印');
  assert.equal(row.title, '靈寶凈明新修九老神印伏魔秘法');
  assert.equal(row.kind, 'seal');
  assert.equal(row.signal, 'heading-slot');
  assert.equal(row.state, 'open');
  assert.match(row.reader_href, /^\/text\/daaed8b692da3daf#/);
  assert.equal(typeof row.created_at, 'number');
});

test('队列项 demo 链接带 book 与 slot，title-tu 不带 slot', () => {
  const body = candidateToQueueItem(sample());
  assert.equal(body.demoHref, '/demo/typography?book=daaed8b692da3daf&slot=daaed8b692da3daf%3A19%3A%E4%BC%8F%E9%AD%94%E7%A5%9E%E5%8D%B0%3Aheading-slot');

  const titleTu = candidateToQueueItem(
    sample({
      id: 'x:book:title:title-tu',
      signal: 'title-tu',
      kind: 'plate',
      slotLabel: '大明玄天上帝瑞應圖錄',
      readerHref: '/text/x',
      anchorKey: 'book:title',
      blockId: undefined,
    }),
  );
  assert.equal(titleTu.demoHref, '/demo/typography?book=daaed8b692da3daf');
});

test('队列筛选：kind / signal / 书名或线索', () => {
  const items = [
    sample(),
    sample({
      id: 'b:1:符:heading-slot',
      bookId: 'other',
      title: '上清靈寶大法',
      kind: 'talisman',
      clue: '右符',
      excerpt: '右符朱書',
      slotLabel: '上元真符',
      signal: 'heading-slot',
    }),
    sample({
      id: 'c:book:title:title-tu',
      signal: 'title-tu',
      kind: 'plate',
      clue: '圖',
      excerpt: '书名含圖',
      slotLabel: '某圖',
      title: '某圖經',
    }),
  ];
  assert.equal(filterCandidateQueue(items, { kind: 'seal' }).length, 1);
  assert.equal(filterCandidateQueue(items, { signal: 'title-tu' }).length, 1);
  assert.equal(filterCandidateQueue(items, { q: '伏魔' }).length, 1);
  assert.equal(filterCandidateQueue(items, { q: '右符' }).length, 1);
});

test('扫描 JSON 中伏魔有 5 条正文槽', () => {
  const fumo = loadIllustrationCatalog().candidates.filter(
    c => c.bookId === 'daaed8b692da3daf' && c.signal !== 'title-tu',
  );
  assert.equal(fumo.length, 5);
  const labels = fumo.map(c => c.slotLabel);
  assert.ok(labels.includes('伏魔神印'));
  assert.ok(labels.includes('訣目掌圓'));
});

test('upsert SQL 不覆盖 state 与 resolved_anchor_id', () => {
  assert.match(UPSERT_CANDIDATE_SQL, /ON CONFLICT \(id\) DO UPDATE SET/i);
  assert.doesNotMatch(UPSERT_CANDIDATE_SQL, /state\s*=\s*EXCLUDED\.state/i);
  assert.doesNotMatch(UPSERT_CANDIDATE_SQL, /resolved_anchor_id\s*=\s*EXCLUDED/i);
  assert.doesNotMatch(UPSERT_CANDIDATE_SQL, /created_at\s*=\s*EXCLUDED/i);
  assert.match(UPSERT_CANDIDATE_SQL, /slot_label\s*=\s*EXCLUDED\.slot_label/i);
});
