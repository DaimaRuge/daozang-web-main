import test from 'node:test';
import assert from 'node:assert/strict';
import { parseText } from '../lib/text-parser.ts';
import {
  buildFootnoteIndex,
  isFootnoteDefinition,
  parseFootnoteDefinition,
  resolveFootnoteTarget,
  splitInlineNoteRefs,
} from '../lib/footnotes.ts';
import fs from 'node:fs';

test('splitInlineNoteRefs 拆分行内 #N', () => {
  const segs = splitInlineNoteRefs('請按東井讖#133，清潔吉日#134沐浴');
  assert.deepEqual(
    segs.map(s => (s.kind === 'ref' ? `ref:${s.num}` : s.value)),
    ['請按東井讖', 'ref:133', '，清潔吉日', 'ref:134', '沐浴'],
  );
});

test('parseFootnoteDefinition 解析校勘条目', () => {
  assert.deepEqual(parseFootnoteDefinition('#133東井識：敦煌本作『東井記』。'), {
    nums: [133],
    body: '東井識：敦煌本作『東井記』。',
  });
  assert.deepEqual(parseFootnoteDefinition('＃1 環珮鏘鏘：敦煌本作「玉質蠶蠻」。'), {
    nums: [1],
    body: '環珮鏘鏘：敦煌本作「玉質蠶蠻」。',
  });
  assert.deepEqual(parseFootnoteDefinition('#6#23于：教煌本作『乎』。'), {
    nums: [6, 23],
    body: '于：教煌本作『乎』。',
  });
});

test('isFootnoteDefinition 不误判标题行内脚注', () => {
  assert.equal(isFootnoteDefinition('周易參同契序#1'), false);
  assert.equal(isFootnoteDefinition('#134『吉日』下敦煌本有『吉時』二字。'), true);
});

test('buildFootnoteIndex 按卷域关联 #133', () => {
  const raw = fs.readFileSync('public/data/content/e5956aabd723f580.json', 'utf8');
  const content = JSON.parse(raw).content as string;
  const parsed = parseText(content, 'e5956aabd723f580', '五稱符上經');
  const index = buildFootnoteIndex(parsed.blocks);

  const body = parsed.blocks.find(b => b.content.includes('請按東井讖#133'));
  assert.ok(body);
  const target = resolveFootnoteTarget(index, body!.id, 133);
  assert.ok(target);
  const def = parsed.blocks.find(b => b.id === target);
  assert.ok(def?.content.includes('東井識'));
});

test('buildFootnoteIndex 卷下 #1 不指向卷上 ＃1', () => {
  const raw = fs.readFileSync('public/data/content/e5956aabd723f580.json', 'utf8');
  const content = JSON.parse(raw).content as string;
  const parsed = parseText(content, 'e5956aabd723f580', '五稱符上經');
  const index = buildFootnoteIndex(parsed.blocks);

  const vol2Heading = parsed.blocks.find(b => b.content.includes('卷下') && b.type === 'heading');
  assert.ok(vol2Heading);
  const vol2Idx = parsed.blocks.findIndex(b => b.id === vol2Heading!.id);
  const vol2Body = parsed.blocks.slice(vol2Idx).find(b => /[#＃]1[^0-9]/.test(b.content) && !isFootnoteDefinition(b.content));
  assert.ok(vol2Body, '卷下应有行内 #1 引用');

  const target = resolveFootnoteTarget(index, vol2Body!.id, 1);
  assert.ok(target);
  const def = parsed.blocks.find(b => b.id === target);
  assert.ok(def);
  assert.match(def!.content, /^#1/);
  assert.doesNotMatch(def!.content, /^＃1/);
});
