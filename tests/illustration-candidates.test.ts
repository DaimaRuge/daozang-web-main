/**
 * 缺图候选检测：伏魔秘法真实底稿 + 公文套话负例。
 * 运行：npx tsx --test tests/illustration-candidates.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseText } from '../lib/text-parser';
import { overrideKey } from '../lib/parser-overrides';
import { kindFromClue } from '../lib/illustrations/kinds';
import {
  detectIllustrationCandidates,
  type BookIllustrationMeta,
} from '../lib/illustrations/detect-candidates';
import { placeCandidates } from '../lib/illustrations/place';

const FUMO_ID = 'daaed8b692da3daf';
const FUMO_META: BookIllustrationMeta = {
  id: FUMO_ID,
  title: '靈寶凈明新修九老神印伏魔秘法',
  collection: '正统道藏',
  category: '洞玄部',
  subcategory: '方法類',
  author: '宋-何守澄',
};

function loadFumo() {
  const raw = JSON.parse(
    fs.readFileSync(path.resolve('public/data/content', `${FUMO_ID}.json`), 'utf-8'),
  ) as { content: string };
  return parseText(raw.content, FUMO_ID, FUMO_META.title);
}

function detectFumo() {
  return detectIllustrationCandidates(loadFumo(), FUMO_META);
}

test('kind 词表：印 > 符 > 掌 > 圖', () => {
  assert.equal(kindFromClue('別本此印'), 'seal');
  assert.equal(kindFromClue('右符朱書'), 'talisman');
  assert.equal(kindFromClue('訣目掌圓'), 'palm');
  assert.equal(kindFromClue('如左圖'), 'plate');
  assert.equal(kindFromClue('印圖'), 'seal');
});

test('伏魔：別本此印 / 伏魔神印 / 右印用金銀 合并为 1 个占位', () => {
  const body = detectFumo().filter(c => c.signal !== 'title-tu');
  const seals = body.filter(c => c.kind === 'seal' && /伏魔神印|別本此印|右印用金銀/.test(c.clue + c.excerpt));
  const cluster = body.filter(c => {
    const blob = `${c.clue}${c.excerpt}`;
    return blob.includes('別本此印') || blob.includes('伏魔神印') || blob.includes('右印用金銀');
  });
  assert.equal(cluster.length, 1, `应合并为一条，实际 ${cluster.map(c => c.clue).join(' | ')}`);
  assert.equal(cluster[0].kind, 'seal');
  assert.ok(seals.length >= 1);
});

test('伏魔：法印式+右印、真符+右符、訣目掌圓 各至少 1 条', () => {
  const body = detectFumo().filter(c => c.signal !== 'title-tu');
  assert.ok(
    body.some(c => c.kind === 'seal' && /法印式|右印不拘/.test(c.clue + c.excerpt)),
    '缺法印式槽',
  );
  const talismans = body.filter(c => c.kind === 'talisman');
  assert.ok(talismans.length >= 2, `真符槽应 ≥2，实际 ${talismans.length}`);
  assert.ok(
    body.some(c => c.kind === 'palm' && c.clue.includes('掌圓')),
    '缺訣目掌圓',
  );
});

test('负例：右奉 / 右關 / 右牒 / 只更訣目 不得命中', () => {
  const source = [
    '公文示範',
    '',
    '右奉',
    '右關某司',
    '右牒請',
    '　　凡服第二炁，垂兩手，掐北辰訣念呪。取炁如服初炁法同，只更訣目。亦三徧為之。',
  ].join('\n');
  const parsed = parseText(source, 'neg01', '公文示範');
  const found = detectIllustrationCandidates(parsed, {
    id: 'neg01',
    title: '公文示範',
    collection: '正统道藏',
    category: '正一部',
    subcategory: '',
  });
  assert.equal(found.filter(c => c.signal !== 'title-tu').length, 0);
});

test('同一 (bookId, anchorKey, signal) 去重', () => {
  const found = detectFumo();
  const keys = found.map(c => `${c.bookId}:${c.anchorKey}:${c.signal}`);
  assert.equal(keys.length, new Set(keys).size);
});

test('anchorKey 与 overrideKey 一致；改 blockId 仍能对齐', () => {
  const parsed = loadFumo();
  const found = detectIllustrationCandidates(parsed, FUMO_META).filter(c => c.blockId);
  assert.ok(found.length > 0);
  for (const c of found) {
    const block = parsed.blocks.find(b => b.id === c.blockId);
    assert.ok(block, c.blockId);
    assert.equal(c.anchorKey, overrideKey(block!));
  }
  const shifted = {
    ...parsed,
    blocks: parsed.blocks.map((b, i) => ({ ...b, id: `shifted-b${i}` })),
  };
  const placed = placeCandidates(shifted.blocks, found);
  assert.ok(placed.length > 0, 'blockId 变化后仍应按 anchorKey 放位');
});

test('title-tu 不产生正文插入点', () => {
  const parsed = parseText('黃庭內景五臟六腑補瀉圖\n\n經名：示範。', 'tu01', '黃庭內景五臟六腑補瀉圖');
  const found = detectIllustrationCandidates(parsed, {
    id: 'tu01',
    title: '黃庭內景五臟六腑補瀉圖',
    collection: '正统道藏',
    category: '洞神部',
    subcategory: '方法類',
  });
  const titleTu = found.filter(c => c.signal === 'title-tu');
  assert.equal(titleTu.length, 1);
  assert.equal(titleTu[0].blockId, undefined);
  assert.equal(titleTu[0].anchorKey, 'book:title');
  const placed = placeCandidates(parsed.blocks, found);
  assert.equal(placed.length, 0);
});

test('视图拼接：占位在伏魔神印之后、首次右印用之前，且该槽只有一框', () => {
  const parsed = loadFumo();
  const found = detectIllustrationCandidates(parsed, FUMO_META);
  const placed = placeCandidates(parsed.blocks, found);
  const heading = parsed.blocks.find(b => b.content === '伏魔神印');
  const firstRight = parsed.blocks.find(b => b.content.startsWith('右印用金銀'));
  assert.ok(heading && firstRight);
  const slot = placed.filter(p => p.afterBlockId === heading!.id || p.beforeBlockId === firstRight!.id);
  assert.equal(slot.length, 1, '该槽只能有一框');
  assert.equal(slot[0].afterBlockId, heading!.id);
  const headingIdx = parsed.blocks.findIndex(b => b.id === heading!.id);
  const rightIdx = parsed.blocks.findIndex(b => b.id === firstRight!.id);
  const afterIdx = parsed.blocks.findIndex(b => b.id === slot[0].afterBlockId);
  assert.ok(afterIdx >= headingIdx && afterIdx < rightIdx);
});

test('伏魔神印槽的展示名是章题，不是仅「別本此印」', () => {
  const found = detectFumo();
  const slot = found.find(c => c.clue.includes('別本此印') || c.slotLabel === '伏魔神印');
  assert.ok(slot);
  assert.equal(slot!.slotLabel, '伏魔神印');
});
