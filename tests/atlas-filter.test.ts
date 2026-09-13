import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atlasEntryMatches } from '../lib/graph/atlas-filter';
import { queryVariants } from '../lib/zh-convert';

test('目录筛选：简体玉皇命中繁体玉皇', () => {
  assert.equal(atlasEntryMatches('玉皇', '玉皇', queryVariants), true);
  assert.equal(atlasEntryMatches('玉皇大帝', '玉皇', queryVariants), true);
});

test('目录筛选：符箓命中符籙', () => {
  assert.equal(atlasEntryMatches('符籙', '符箓', queryVariants), true);
});

test('目录筛选：空词不过滤', () => {
  assert.equal(atlasEntryMatches('真武', '  ', queryVariants), true);
});

test('目录筛选：不相干不命中', () => {
  assert.equal(atlasEntryMatches('真武', '内丹', queryVariants), false);
});
