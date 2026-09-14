import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideCooccurEdge, shouldQueueForReview } from '../lib/graph/review-policy';
import type { GraphEdge, GraphNode } from '../lib/graph/schema';

function node(id: string, label: string, works = 20): GraphNode {
  return { id, type: 'concept', label, origin: 'curated', works };
}

test('共现裁定：近义或同域非广布则确认', () => {
  assert.equal(
    decideCooccurEdge({ weight: 8 }, node('a', '雷電'), node('b', '雷法')),
    'confirm',
  );
  assert.equal(
    decideCooccurEdge({ weight: 3 }, node('a', '陶隱居'), node('b', '陶弘景')),
    'confirm',
  );
});

test('共现裁定：广布概念或无共享用字则否决', () => {
  assert.equal(
    decideCooccurEdge({ weight: 80 }, node('a', '無為', 1200), node('b', '長生', 1000)),
    'reject',
  );
  assert.equal(
    decideCooccurEdge({ weight: 2 }, node('a', '徘徊'), node('b', '肌膚')),
    'reject',
  );
});

test('文献近邻不进审核队列；抽取边进入', () => {
  const a = node('concept:a', '符籙');
  const b = node('concept:b', '神符');
  const similar: GraphEdge = {
    from: 'work:1',
    to: 'work:2',
    type: 'similar_work',
    source: 'similar',
    confidence: 0.4,
    weight: 3,
  };
  assert.equal(shouldQueueForReview(similar, undefined, undefined), false);
  const extract: GraphEdge = {
    from: 'a',
    to: 'b',
    type: 'related_to',
    source: 'extract',
    confidence: 0.55,
  };
  assert.equal(shouldQueueForReview(extract, a, b), true);
  const co: GraphEdge = {
    from: 'a',
    to: 'b',
    type: 'cooccurs_with',
    source: 'cooccur',
    confidence: 0.5,
    weight: 10,
  };
  assert.equal(shouldQueueForReview(co, a, b), true);
  const noise: GraphEdge = {
    from: 'a',
    to: 'b',
    type: 'cooccurs_with',
    source: 'cooccur',
    confidence: 0.4,
    weight: 2,
  };
  assert.equal(
    shouldQueueForReview(noise, node('x', '徘徊'), node('y', '肌膚')),
    false,
  );
});
