/**
 * 图谱人工校正层：稳定键、确认/否决叠加、审核队列过滤。
 * 关键约束：校正不写回原文、不改 graph.json.gz；对称边键与展开方向无关。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyGraphOverrides,
  edgeOverrideKey,
  listGraphReviewQueue,
  type GraphOverridesFile,
} from '../lib/graph/overrides';
import type { GraphEdge, KnowledgeGraph } from '../lib/graph/schema';

function edge(partial: Partial<GraphEdge> & Pick<GraphEdge, 'from' | 'to' | 'type' | 'source'>): GraphEdge {
  return { confidence: 0.5, weight: 3, ...partial };
}

function miniGraph(edges: GraphEdge[]): KnowledgeGraph {
  const ids = new Set<string>();
  for (const e of edges) {
    ids.add(e.from);
    ids.add(e.to);
  }
  return {
    version: 1,
    buildTime: 'test',
    stats: { nodes: ids.size, edges: edges.length, works: 0, entities: 0, scannedChars: 0, buildMs: 0 },
    nodes: [...ids].map(id => {
      const [type, raw] = id.split(':') as ['concept' | 'work', string];
      return { id, type, label: raw, origin: type === 'concept' ? 'auto' as const : 'catalog' as const };
    }),
    edges,
    aliasIndex: {},
  };
}

const EMPTY: GraphOverridesFile = { version: 1, edges: {} };

test('对称关系的校正键与 from/to 顺序无关', () => {
  const a = edgeOverrideKey('concept:b', 'concept:a', 'cooccurs_with');
  const b = edgeOverrideKey('concept:a', 'concept:b', 'cooccurs_with');
  assert.equal(a, b);
  assert.equal(a, 'concept:a|cooccurs_with|concept:b');
});

test('有向关系的校正键保留方向', () => {
  const a = edgeOverrideKey('concept:x', 'work:1', 'mentioned_in');
  const b = edgeOverrideKey('work:1', 'concept:x', 'mentioned_in');
  assert.notEqual(a, b);
});

test('确认后边改为人工审定且置信度记满', () => {
  const e = edge({
    from: 'concept:a',
    to: 'concept:b',
    type: 'cooccurs_with',
    source: 'cooccur',
    confidence: 0.55,
  });
  const graph = miniGraph([e]);
  const key = edgeOverrideKey(e.from, e.to, e.type);
  const out = applyGraphOverrides(graph, {
    version: 1,
    edges: { [key]: { decision: 'confirm', reviewedAt: 1 } },
  });
  assert.equal(out.edges.length, 1);
  assert.equal(out.edges[0].source, 'human');
  assert.equal(out.edges[0].confidence, 1);
  assert.equal(out.edges[0].type, 'cooccurs_with');
});

test('否决后边从运行时图中消失，产物对象被替换而非原地改', () => {
  const keep = edge({
    from: 'concept:a',
    to: 'work:1',
    type: 'mentioned_in',
    source: 'mention',
    confidence: 0.9,
  });
  const drop = edge({
    from: 'concept:a',
    to: 'concept:b',
    type: 'cooccurs_with',
    source: 'cooccur',
    confidence: 0.4,
  });
  const graph = miniGraph([keep, drop]);
  const key = edgeOverrideKey(drop.from, drop.to, drop.type);
  const out = applyGraphOverrides(graph, {
    version: 1,
    edges: { [key]: { decision: 'reject', reviewedAt: 1 } },
  });
  assert.equal(out.edges.length, 1);
  assert.equal(out.edges[0].to, 'work:1');
  assert.equal(graph.edges.length, 2, '原始产物不得被改写');
  assert.equal(out.stats.edges, 1);
});

test('无命中校正时返回原对象（零成本路径）', () => {
  const graph = miniGraph([
    edge({ from: 'concept:a', to: 'concept:b', type: 'cooccurs_with', source: 'cooccur' }),
  ]);
  assert.equal(applyGraphOverrides(graph, EMPTY), graph);
  assert.equal(
    applyGraphOverrides(graph, { version: 1, edges: { 'concept:x|cooccurs_with|concept:y': { decision: 'reject', reviewedAt: 1 } } }),
    graph,
  );
});

test('审核队列默认只收统计推算的低置信度边，目录边不进待审', () => {
  const graph = miniGraph([
    edge({ from: 'work:1', to: 'concept:部', type: 'part_of', source: 'catalog', confidence: 0.98 }),
    edge({ from: 'concept:a', to: 'concept:b', type: 'cooccurs_with', source: 'cooccur', confidence: 0.5, weight: 10 }),
    edge({ from: 'work:1', to: 'work:2', type: 'similar_work', source: 'similar', confidence: 0.8, weight: 1 }),
    edge({ from: 'concept:c', to: 'concept:d', type: 'cooccurs_with', source: 'cooccur', confidence: 0.4, weight: 2 }),
  ]);
  const page = listGraphReviewQueue(graph, EMPTY, { status: 'pending' });
  assert.equal(page.pending, 2);
  assert.equal(page.total, 2);
  assert.equal(page.items[0].fromLabel, 'a', '权重大的待考边排在前面');
  assert.equal(page.confirmed, 0);
});

test('确认/否决后边进入对应分栏，待审计数下降', () => {
  const weak = edge({
    from: 'concept:a',
    to: 'concept:b',
    type: 'cooccurs_with',
    source: 'cooccur',
    confidence: 0.5,
  });
  const graph = miniGraph([weak]);
  const key = edgeOverrideKey(weak.from, weak.to, weak.type);
  const overrides: GraphOverridesFile = {
    version: 1,
    edges: { [key]: { decision: 'confirm', reviewedAt: 1 } },
  };
  const pending = listGraphReviewQueue(graph, overrides, { status: 'pending' });
  const confirmed = listGraphReviewQueue(graph, overrides, { status: 'confirm' });
  assert.equal(pending.pending, 0);
  assert.equal(pending.total, 0);
  assert.equal(confirmed.confirmed, 1);
  assert.equal(confirmed.items[0].key, key);
});

test('节点名筛选只影响列表，不影响分栏计数', () => {
  const graph = miniGraph([
    edge({ from: 'concept:無為', to: 'concept:清靜', type: 'cooccurs_with', source: 'cooccur', confidence: 0.5 }),
    edge({ from: 'concept:三清', to: 'concept:玉清', type: 'cooccurs_with', source: 'cooccur', confidence: 0.5 }),
  ]);
  const page = listGraphReviewQueue(graph, EMPTY, { status: 'pending', q: '無為' });
  assert.equal(page.pending, 2);
  assert.equal(page.total, 1);
  assert.equal(page.items[0].fromLabel, '無為');
});
