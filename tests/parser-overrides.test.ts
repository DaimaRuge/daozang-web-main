/**
 * 人工校正层单元测试：稳定键与 overrides 叠加逻辑。
 * 关键约束：校正键必须与解析规则版本无关（原文行号 + 内容前缀），
 * 叠加后目录与统计必须重建。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseText } from '../lib/text-parser';
import { applyOverrides, overrideKey } from '../lib/parser-overrides';

const SAMPLE = ['某某經', '', '短句甲', '　　正文段落內容，這裏是一段經文。'].join('\n');

test('overrideKey 由原文行号与内容前缀构成，与块序号无关', () => {
  const parsed = parseText(SAMPLE, 'test-book', '某某經');
  const block = parsed.blocks.find(b => b.content === '短句甲')!;
  assert.equal(overrideKey(block), `${block.sourceStart}:短句甲`);
});

test('applyOverrides 改判类型、置信度记满、parser 标记为人工', () => {
  const parsed = parseText(SAMPLE, 'test-book', '某某經');
  const target = parsed.blocks.find(b => b.content === '短句甲')!;
  assert.ok(target.confidence < 0.7, '前置条件：该块应为低置信度');

  const out = applyOverrides(parsed, {
    [overrideKey(target)]: { type: 'paragraph', reviewedAt: 1 },
  });

  const fixed = out.blocks.find(b => b.content === '短句甲')!;
  assert.equal(fixed.type, 'paragraph');
  assert.equal(fixed.confidence, 1);
  assert.equal(fixed.parser, 'human-review');
  // 低置信度统计随之减少
  assert.equal(out.stats.lowConfidenceBlocks, parsed.stats.lowConfidenceBlocks - 1);
});

test('改判为正文后该块从目录移除；改判为标题则进入目录', () => {
  const parsed = parseText(SAMPLE, 'test-book', '某某經');
  const target = parsed.blocks.find(b => b.content === '短句甲')!;
  assert.ok(parsed.toc.some(t => t.blockId === target.id), '前置条件：低置信度小标题在目录中');

  const demoted = applyOverrides(parsed, {
    [overrideKey(target)]: { type: 'paragraph', reviewedAt: 1 },
  });
  assert.ok(!demoted.toc.some(t => t.blockId === target.id), '改判为正文后应移出目录');

  const promoted = applyOverrides(parsed, {
    [overrideKey(target)]: { type: 'subheading', level: 3, reviewedAt: 1 },
  });
  assert.ok(promoted.toc.some(t => t.blockId === target.id), '确认为小标题后保留在目录');
});

test('无命中校正时返回原对象（零成本路径）', () => {
  const parsed = parseText(SAMPLE, 'test-book', '某某經');
  assert.equal(applyOverrides(parsed, {}), parsed);
  assert.equal(applyOverrides(parsed, { '999:不存在的块': { type: 'paragraph', reviewedAt: 1 } }), parsed);
});
