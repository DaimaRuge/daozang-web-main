/**
 * 自动术语并入挑选：扩到 1000 时优先神名/山川，不把叠词和「登山」类残片算进名额。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isMergeableConcept,
  isMergeablePlace,
  pickAutoTerms,
} from '../lib/graph/auto-merge';
import type { AutoTermEntry } from '../lib/graph/schema';

function term(partial: Partial<AutoTermEntry> & Pick<AutoTermEntry, 'term' | 'type'>): AutoTermEntry {
  return {
    score: 0.5,
    typeConfidence: 0.8,
    typeBasis: 'test',
    freq: 40,
    docFreq: 10,
    cohesion: 4,
    freedom: 3,
    titleDocFreq: 0,
    ...partial,
  };
}

test('山川：三字山名与洞天保留，登山/入華山/召五嶽丢弃', () => {
  assert.equal(isMergeablePlace('崑崙山'), true);
  assert.equal(isMergeablePlace('七十二福地'), true);
  assert.equal(isMergeablePlace('西嶽'), true);
  assert.equal(isMergeablePlace('登山'), false);
  assert.equal(isMergeablePlace('入華山'), false);
  assert.equal(isMergeablePlace('召五嶽'), false);
});

test('概念：叠词丢弃；少陰/橐籥保留', () => {
  assert.equal(isMergeableConcept('團團', 10), false);
  assert.equal(isMergeableConcept('少陰', 5), true);
  assert.equal(isMergeableConcept('橐籥', 14), true);
  assert.equal(isMergeableConcept('催促', 10), false);
  assert.equal(isMergeableConcept('太平氣', 2), true);
});

test('挑选：神祇配额先于概念补位，总数不超过上限', () => {
  const unused: AutoTermEntry[] = [
    term({ term: '廉貞星君', type: 'deity', score: 0.4 }),
    term({ term: '催促', type: 'concept', score: 0.9, cohesion: 10 }),
    term({ term: '少陰', type: 'concept', score: 0.4, cohesion: 5 }),
    term({ term: '崑崙山', type: 'place', score: 0.4 }),
    term({ term: '登山', type: 'place', score: 0.8 }),
  ];
  const picked = pickAutoTerms(unused, 10);
  const labels = picked.map(t => t.term);
  assert.ok(labels.includes('廉貞星君'));
  assert.ok(labels.includes('少陰'));
  assert.ok(labels.includes('崑崙山'));
  assert.ok(!labels.includes('催促'));
  assert.ok(!labels.includes('登山'));
  assert.ok(picked.length <= 10);
});
