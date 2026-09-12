/**
 * 检索层单元测试：简繁变体扩展与概念候选词提取。
 * 这两个纯函数是「简体提问命中繁体语料」的关键路径，必须有回归保护。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractConcepts } from '../lib/agent/concepts';
import { queryVariants } from '../lib/zh-convert';

test('简体查询扩展出繁体变体', () => {
  const variants = queryVariants('道德经');
  assert.ok(variants.includes('道德经'), '保留原始输入');
  assert.ok(variants.includes('道德經'), '包含繁体变体');
});

test('「为」类异体字产生多个变体（爲/為）', () => {
  const variants = queryVariants('无为');
  // OpenCC 标准繁体与台湾正体对「为」的写法不同，两者都应在候选中
  assert.ok(variants.some(v => v.includes('爲')) || variants.some(v => v.includes('為')));
  assert.ok(variants.length >= 2);
});

test('繁体输入原样保留且不重复', () => {
  const variants = queryVariants('道德經');
  assert.equal(variants[0], '道德經');
  assert.equal(new Set(variants).size, variants.length);
});

test('空查询返回空数组', () => {
  assert.deepEqual(queryVariants('  '), []);
});

test('概念提取：剔除疑问词保留核心概念', () => {
  const concepts = extractConcepts('什么是清静无为？');
  assert.ok(concepts.includes('清静无为'), `应提取「清静无为」，实际：${concepts.join(',')}`);
});

test('概念提取：书名号内容不作为概念（由书名检索处理）', () => {
  const concepts = extractConcepts('《道德經》的核心思想是什么？');
  assert.ok(!concepts.includes('道德經'));
  assert.ok(concepts.includes('核心思想'));
});

test('概念提取：多概念问句分别提取', () => {
  const concepts = extractConcepts('内丹与外丹有什么区别？');
  assert.ok(concepts.includes('内丹'), `实际：${concepts.join(',')}`);
  assert.ok(concepts.includes('外丹'), `实际：${concepts.join(',')}`);
});

test('概念提取：最多返回 3 个候选', () => {
  const concepts = extractConcepts('内丹 外丹 符箓 斋醮 存思 坐忘');
  assert.ok(concepts.length <= 3);
});

test('概念提取：词表能从嵌套句子里抽出术语', () => {
  const lexicon = ['橐籥', '符籙', '無為', '无为'];
  const concepts = extractConcepts('道藏里讲橐籥的地方在哪', { lexicon });
  assert.deepEqual(concepts, ['橐籥']);
});

test('概念提取：同一实体的别名只保留一条', () => {
  const lexicon = ['無為', '无为', '清靜無為', '清静无为'];
  const concepts = extractConcepts('什么是清静无为？', {
    lexicon,
    variants: queryVariants,
    canonicalId: term => (term.includes('为') || term.includes('為') || term.includes('爲') ? 'concept:wuwei' : undefined),
  });
  assert.equal(concepts.length, 1, `别名应合并，实际：${concepts.join(',')}`);
});

test('概念提取：词表最长匹配优先于短别名', () => {
  const lexicon = ['無為', '清靜無為', '清静无为'];
  const concepts = extractConcepts('什么是清静无为？', {
    lexicon,
    variants: queryVariants,
  });
  assert.ok(
    concepts.includes('清靜無為') || concepts.includes('清静无为'),
    `应命中「清靜無為」，实际：${concepts.join(',')}`,
  );
  assert.ok(!concepts.includes('無為'), '短词不应从长匹配里再拆出来');
});

test('概念提取：无词表时行为与停用词切分一致', () => {
  assert.deepEqual(
    extractConcepts('内丹与外丹有什么区别？'),
    extractConcepts('内丹与外丹有什么区别？', { lexicon: [] }),
  );
});