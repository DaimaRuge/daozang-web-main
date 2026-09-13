/**
 * 待审关系提案：只追加 extract/llm 边，不覆盖产物已有边。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGraphProposals, extractRelationProposals } from '../lib/graph/proposals';
import type { GraphEdge, KnowledgeGraph } from '../lib/graph/schema';

function graph(edges: GraphEdge[], nodes: KnowledgeGraph['nodes']): KnowledgeGraph {
  return {
    version: 1,
    buildTime: 'test',
    stats: { nodes: nodes.length, edges: edges.length, works: 0, entities: 0, scannedChars: 0, buildMs: 0 },
    nodes,
    edges,
    aliasIndex: {},
  };
}

test('提案：已有 related_to 不再重复写入', () => {
  const g = graph(
    [{ from: 'deity:auto-a', to: 'deity:ziwei', type: 'related_to', source: 'gazetteer', confidence: 0.9 }],
    [
      { id: 'deity:auto-a', type: 'deity', label: '北極紫微', origin: 'auto' },
      { id: 'deity:ziwei', type: 'deity', label: '紫微', origin: 'curated' },
    ],
  );
  const next = applyGraphProposals(g, {
    version: 1,
    edges: [
      { from: 'deity:auto-a', to: 'deity:ziwei', type: 'related_to', source: 'extract', confidence: 0.55 },
    ],
  });
  assert.equal(next.edges.length, 1);
  assert.equal(next.edges[0].source, 'gazetteer');
});

test('提案：新边并入且 source 保持 extract', () => {
  const g = graph([], [
    { id: 'deity:auto-a', type: 'deity', label: '北極紫微', origin: 'auto' },
    { id: 'deity:ziwei', type: 'deity', label: '紫微', origin: 'curated' },
  ]);
  const next = applyGraphProposals(g, {
    version: 1,
    edges: [
      { from: 'deity:auto-a', to: 'deity:ziwei', type: 'related_to', source: 'extract', confidence: 0.55 },
    ],
  });
  assert.equal(next.edges.length, 1);
  assert.equal(next.edges[0].source, 'extract');
  assert.ok(next.edges[0].confidence < 0.7);
});

test('抽取：只收策展↔自动的强共现，且已有构词边的跳过', () => {
  const g = graph(
    [
      { from: 'deity:auto-a', to: 'deity:ziwei', type: 'cooccurs_with', source: 'cooccur', confidence: 0.5, weight: 8 },
      { from: 'deity:auto-b', to: 'deity:ziwei', type: 'cooccurs_with', source: 'cooccur', confidence: 0.5, weight: 8 },
      { from: 'deity:auto-b', to: 'deity:ziwei', type: 'subclass_of', source: 'morphology', confidence: 0.8 },
      { from: 'deity:auto-c', to: 'deity:ziwei', type: 'cooccurs_with', source: 'cooccur', confidence: 0.5, weight: 2 },
    ],
    [
      { id: 'deity:auto-a', type: 'deity', label: '紫微帝君', origin: 'auto', works: 20 },
      { id: 'deity:auto-b', type: 'deity', label: '紫微夫人', origin: 'auto', works: 20 },
      { id: 'deity:auto-c', type: 'deity', label: '丙', origin: 'auto', works: 20 },
      { id: 'deity:ziwei', type: 'deity', label: '紫微', origin: 'curated', works: 100 },
    ],
  );
  const proposals = extractRelationProposals(g, 10);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].from, 'deity:auto-a');
  assert.equal(proposals[0].to, 'deity:ziwei');
  assert.equal(proposals[0].source, 'extract');
});
