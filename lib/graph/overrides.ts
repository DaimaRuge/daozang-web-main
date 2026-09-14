/**
 * 图谱关系人工校正层（overrides，仅服务端）。
 *
 * 与解析审核的关系：/review 改的是第二层结构（块类型），本文件改的是
 * 第三层关系（边是否成立）。两者都是 stand-off —— 校正不写回原文、
 * 不改 graph.json.gz 构建产物，运行时叠加。构建脚本重跑不会冲掉人工判断。
 *
 * 为什么只审边、不在这里改词表：自动术语的去留是抽取流水线的事；
 * 审核者面对的是「图上这条连线该不该给读者看」。确认后 source 记为
 * human、置信度记满；否决则运行时删除该边（产物里仍在，可撤销）。
 *
 * 稳定键：from|type|to。共现/文献相关等对称关系按节点 id 字典序归一，
 * 避免同一条无向边因展开方向不同写成两个键。
 */

import fs from 'fs';
import path from 'path';
import {
  EDGE_LABELS,
  GraphEdge,
  GraphEdgeSource,
  GraphEdgeType,
  GraphNode,
  KnowledgeGraph,
} from './schema';
import type {
  GraphEdgeDecision,
  GraphEdgeOverride,
  GraphOverridesFile,
  GraphReviewItem,
  GraphReviewStatus,
} from './override-schema';
import { shouldQueueForReview } from './review-policy';

export type {
  GraphEdgeDecision,
  GraphEdgeOverride,
  GraphOverridesFile,
  GraphReviewItem,
  GraphReviewStatus,
} from './override-schema';

/** 可筛选的统计来源。文献近邻默认不进待审队列，见 shouldQueueForReview。 */
export const REVIEWABLE_EDGE_SOURCES: GraphEdgeSource[] = ['cooccur', 'similar', 'extract', 'llm'];

const SYMMETRIC_TYPES = new Set<GraphEdgeType>(['related_to', 'cooccurs_with', 'similar_work']);

const OVERRIDES_PATH = path.join(process.cwd(), 'data', 'graph', 'overrides.json');

const EMPTY: GraphOverridesFile = { version: 1, edges: {} };

let cache: GraphOverridesFile | null = null;

export function edgeOverrideKey(from: string, to: string, type: GraphEdgeType): string {
  if (SYMMETRIC_TYPES.has(type) && from > to) {
    return `${to}|${type}|${from}`;
  }
  return `${from}|${type}|${to}`;
}

export function edgeOverrideKeyOf(edge: Pick<GraphEdge, 'from' | 'to' | 'type'>): string {
  return edgeOverrideKey(edge.from, edge.to, edge.type);
}

export function loadGraphOverrides(): GraphOverridesFile {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf-8')) as GraphOverridesFile;
    cache = parsed?.version === 1 && parsed.edges ? parsed : { version: 1, edges: {} };
  } catch {
    cache = { ...EMPTY, edges: {} };
  }
  return cache;
}

/** 保存单条边校正（传 null 撤销）。由 /api/review/graph 调用，仅开发环境写盘。 */
export function saveGraphEdgeOverride(key: string, override: GraphEdgeOverride | null): void {
  const all = loadGraphOverrides();
  if (override) all.edges[key] = override;
  else delete all.edges[key];
  fs.mkdirSync(path.dirname(OVERRIDES_PATH), { recursive: true });
  fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(all, null, 2), 'utf-8');
  cache = all;
}

/**
 * 把人工校正叠加到图谱产物上。
 * 注入 overrides 是为了单测不碰磁盘；运行时默认读盘。
 */
export function applyGraphOverrides(
  graph: KnowledgeGraph,
  overrides: GraphOverridesFile = loadGraphOverrides(),
): KnowledgeGraph {
  const map = overrides.edges;
  if (!map || Object.keys(map).length === 0) return graph;

  let touched = 0;
  const edges: GraphEdge[] = [];
  for (const edge of graph.edges) {
    const o = map[edgeOverrideKeyOf(edge)];
    if (!o) {
      edges.push(edge);
      continue;
    }
    touched++;
    if (o.decision === 'reject') continue;
    edges.push({ ...edge, source: 'human', confidence: 1 });
  }
  if (touched === 0) return graph;

  return {
    ...graph,
    edges,
    stats: { ...graph.stats, edges: edges.length },
  };
}

export interface GraphReviewQuery {
  status?: GraphReviewStatus;
  source?: GraphEdgeSource | 'all';
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface GraphReviewPage {
  items: GraphReviewItem[];
  total: number;
  page: number;
  pageSize: number;
  pending: number;
  confirmed: number;
  rejected: number;
}

function isPendingEdge(
  edge: GraphEdge,
  decision: GraphEdgeDecision | null,
  from: GraphNode | undefined,
  to: GraphNode | undefined,
): boolean {
  return !decision && shouldQueueForReview(edge, from, to);
}

/**
 * 审核队列：只收规则/模型抽取，以及政策裁定为确认的高信号共现。
 * 文献近邻与其余弱共现留在图上标待考，不占人工队列；广布噪声由批量脚本否决。
 * 已校正的边无论原置信度如何都出现在对应分栏，便于复查/撤销。
 * 分栏计数不受检索词/来源筛选影响，避免切筛选时徽章乱跳。
 */
export function listGraphReviewQueue(
  graph: KnowledgeGraph,
  overrides: GraphOverridesFile,
  query: GraphReviewQuery = {},
): GraphReviewPage {
  const status: GraphReviewStatus = query.status ?? 'pending';
  const sourceFilter = query.source && query.source !== 'all' ? query.source : null;
  const needle = query.q?.trim() ?? '';
  const pageSize = Math.min(Math.max(query.pageSize ?? 40, 1), 100);
  const page = Math.max(query.page ?? 1, 1);
  const nodeById = new Map(graph.nodes.map(n => [n.id, n]));

  let pending = 0;
  let confirmed = 0;
  let rejected = 0;
  const matched: GraphReviewItem[] = [];

  for (const edge of graph.edges) {
    const key = edgeOverrideKeyOf(edge);
    const decision = overrides.edges[key]?.decision ?? null;
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    const pendingNow = isPendingEdge(edge, decision, from, to);

    if (decision === 'confirm') confirmed++;
    else if (decision === 'reject') rejected++;
    else if (pendingNow) pending++;

    const wantPending = status === 'pending' && pendingNow;
    const wantConfirm = status === 'confirm' && decision === 'confirm';
    const wantReject = status === 'reject' && decision === 'reject';
    if (!wantPending && !wantConfirm && !wantReject) continue;
    if (sourceFilter && edge.source !== sourceFilter) continue;

    if (!from || !to) continue;
    if (needle && !from.label.includes(needle) && !to.label.includes(needle)) continue;

    matched.push({
      key,
      fromId: from.id,
      toId: to.id,
      fromLabel: from.label,
      toLabel: to.label,
      fromType: from.type,
      toType: to.type,
      fromOrigin: from.origin,
      toOrigin: to.origin,
      type: edge.type,
      typeLabel: EDGE_LABELS[edge.type],
      source: edge.source,
      confidence: edge.confidence,
      weight: edge.weight,
      decision,
      quote: edge.citations?.[0]?.quote,
    });
  }

  // 权重大的统计关系优先：那是「看起来最像真关系」的待考边，人工时间应花在这里
  matched.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));

  const total = matched.length;
  const start = (page - 1) * pageSize;
  return {
    items: matched.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    pending,
    confirmed,
    rejected,
  };
}

/** 供测试注入：清空模块缓存，避免用例互相污染 */
export function resetGraphOverridesCache(): void {
  cache = null;
}

export function graphOverridesPath(): string {
  return OVERRIDES_PATH;
}
