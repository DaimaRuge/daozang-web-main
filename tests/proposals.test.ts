/**
 * 待审关系提案：只追加 extract/llm 边，不覆盖产物已有边。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGraphProposals, extractRelationProposals, reviewProposalsWithLlm } from '../lib/graph/proposals';
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

test('抽取：三洞不得因剥掉「洞」而挂到三清', () => {
  const g = graph(
    [{ from: 'concept:auto-sandong', to: 'concept:sanqing', type: 'cooccurs_with', source: 'cooccur', confidence: 0.5, weight: 200 }],
    [
      { id: 'concept:auto-sandong', type: 'concept', label: '三洞', origin: 'auto', works: 291 },
      { id: 'concept:sanqing', type: 'concept', label: '三清', origin: 'curated', works: 100 },
    ],
  );
  assert.equal(extractRelationProposals(g, 10).length, 0);
});

test('LLM 复核：接受标 llm，拒绝剔除；解析失败保持 extract', async () => {
  const edges = [
    { from: 'a', to: 'x', type: 'related_to' as const, source: 'extract' as const, confidence: 0.55 },
    { from: 'b', to: 'y', type: 'related_to' as const, source: 'extract' as const, confidence: 0.55 },
  ];
  const nodes = [
    { id: 'a', label: '雷電', type: 'concept' },
    { id: 'x', label: '雷法', type: 'concept' },
    { id: 'b', label: '三洞', type: 'concept' },
    { id: 'y', label: '三清', type: 'concept' },
  ];
  const reviewed = await reviewProposalsWithLlm(edges, nodes, async () =>
    JSON.stringify([{ i: 1, accept: true }, { i: 2, accept: false }]),
  );
  assert.equal(reviewed.length, 1);
  assert.equal(reviewed[0].from, 'a');
  assert.equal(reviewed[0].source, 'llm');
  assert.ok(reviewed[0].confidence < 0.7);
  const fallback = await reviewProposalsWithLlm(edges, nodes, async () => '不是 JSON');
  assert.equal(fallback.length, 2);
  assert.ok(fallback.every(e => e.source === 'extract'));
});

test('抽取：近义别名置信度更高；科仪可连概念', () => {
  const g = graph(
    [
      { from: 'person:auto-yin', to: 'person:taohongjing', type: 'cooccurs_with', source: 'cooccur', confidence: 0.5, weight: 3 },
      { from: 'ritual:auto-jiao', to: 'concept:jiaotan', type: 'cooccurs_with', source: 'cooccur', confidence: 0.5, weight: 8 },
    ],
    [
      { id: 'person:auto-yin', type: 'person', label: '陶隱居', origin: 'auto', works: 20 },
      { id: 'person:taohongjing', type: 'person', label: '陶弘景', origin: 'curated', works: 40 },
      { id: 'ritual:auto-jiao', type: 'ritual', label: '設醮儀', origin: 'auto', works: 10 },
      { id: 'concept:jiaotan', type: 'concept', label: '醮壇', origin: 'curated', works: 80 },
    ],
  );
  const proposals = extractRelationProposals(g, 10);
  assert.equal(proposals.length, 2);
  const yin = proposals.find(p => p.from === 'person:auto-yin');
  assert.ok(yin && yin.confidence > 0.55);
  assert.equal(proposals.find(p => p.from === 'ritual:auto-jiao')?.to, 'concept:jiaotan');
});
