/**
 * 知识图谱运行时查询（仅服务端，依赖 fs）。
 *
 * 为什么是「只读邻接 + 局部展开」而不是全图查询：
 * 道藏 1504 部、图上近两万条边，一次性铺给用户毫无用处 ——
 * 用户真正需要的是「从我关心的这一点向外走一跳」。故本模块只提供
 * 三种入口：按词解析中心点、按中心点展开一跳、以及某部典籍的邻域。
 *
 * 为什么图谱产物整体载入内存：产物与 index.json 同量级（约 5MB），
 * 与 lib/data.ts 的做法一致（模块级缓存，每进程一次）；
 * 这样避免了给 public/data 再添数千个碎文件。
 *
 * 内容边界：本模块不生成任何解释性文字，只搬运构建期产物中已带
 * source / confidence / citations 的边，让 UI 能如实告知「凭什么这么连」。
 */

import fs from 'fs';
import path from 'path';
import {
  EDGE_LABELS,
  GraphEdge,
  GraphEdgeType,
  GraphNode,
  GraphView,
  KnowledgeGraph,
  RelatedItem,
  RelationGroup,
} from './schema';
import { queryVariants } from '../zh-convert';
import { getEntryById, searchEntries } from '../data';
import { searchFullText } from '../fulltext-search';

/** 每个关系分组默认展示条数：够看出结构，又不至于把屏幕铺满 */
const DEFAULT_GROUP_LIMIT = 12;

interface GraphRuntime {
  graph: KnowledgeGraph;
  nodeById: Map<string, GraphNode>;
  /** 节点 → 相关边（双向），构建一次供全部查询复用 */
  adjacency: Map<string, GraphEdge[]>;
}

let _runtime: GraphRuntime | null | undefined;

/**
 * 加载图谱产物。产物缺失时返回 null 而不是抛错 ——
 * 图谱是增强能力，未构建时站点其余功能必须照常可用。
 */
function getRuntime(): GraphRuntime | null {
  if (_runtime !== undefined) return _runtime;

  const graphPath = path.resolve(process.cwd(), 'public/data/graph.json');
  if (!fs.existsSync(graphPath)) {
    console.warn('[graph] public/data/graph.json 不存在，请先运行 npm run build-graph');
    _runtime = null;
    return null;
  }

  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf-8')) as KnowledgeGraph;
  const nodeById = new Map(graph.nodes.map(n => [n.id, n]));
  const adjacency = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges) {
    for (const end of [edge.from, edge.to]) {
      const list = adjacency.get(end);
      if (list) list.push(edge);
      else adjacency.set(end, [edge]);
    }
  }

  _runtime = { graph, nodeById, adjacency };
  return _runtime;
}

/** 图谱是否可用（UI 据此决定是否渲染入口，而不是渲染一个空面板） */
export function isGraphAvailable(): boolean {
  return getRuntime() !== null;
}

export function getGraphStats(): KnowledgeGraph['stats'] | null {
  return getRuntime()?.graph.stats ?? null;
}

export function getNode(id: string): GraphNode | null {
  return getRuntime()?.nodeById.get(id) ?? null;
}

/**
 * 把查询词解析为图谱实体。
 * 语料与词表以繁体为主而用户多输入简体，故复用检索层的简繁变体策略
 * （lib/zh-convert.ts），保证「符箓」与「符籙」进同一个入口。
 */
export function resolveQuery(query: string): GraphNode | null {
  const rt = getRuntime();
  if (!rt) return null;
  const q = query.trim();
  if (!q) return null;

  for (const variant of queryVariants(q)) {
    const id = rt.graph.aliasIndex[variant];
    if (id) {
      const node = rt.nodeById.get(id);
      if (node) return node;
    }
  }
  return null;
}

/** 关系分组标题：同一关系在不同方向上的读法不同，避免出现「见于典籍：某概念」这种病句 */
function groupLabel(type: GraphEdgeType, direction: 'out' | 'in', centerType: string): string {
  if (type === 'mentioned_in') return direction === 'out' ? '见于典籍' : '书中提及';
  if (type === 'part_of') return direction === 'out' ? '所属部类' : '所收典籍';
  if (type === 'authored_by') return direction === 'out' ? '题署著者' : '题署作品';
  if (type === 'has_tag') return direction === 'out' ? '主题标签' : '同标签典籍';
  if (type === 'subclass_of') return direction === 'out' ? '上位概念' : '下位概念';
  if (type === 'illustrates') return direction === 'out' ? '配图所属' : '相关图像';
  if (type === 'depicts') return direction === 'out' ? '图中所绘' : '相关图像';
  if (type === 'similar_work') return centerType === 'work' ? '关联文献' : EDGE_LABELS[type];
  return EDGE_LABELS[type];
}

/**
 * 语义上对称的关系类型：方向不携带信息。
 * 「符籙 related_to 雷法」与「雷法 related_to 符籙」是同一件事，
 * 若按方向分成两组，用户会看到两个同名分组、同一个邻居出现两次。
 */
const SYMMETRIC_TYPES = new Set<GraphEdgeType>(['related_to', 'cooccurs_with', 'similar_work']);

/** 分组内排序：置信度优先，其次权重（提及次数 / 共现部数 / 相似度） */
function rankItems(items: RelatedItem[]): RelatedItem[] {
  return items.sort((a, b) => {
    const cd = b.edge.confidence - a.edge.confidence;
    if (Math.abs(cd) > 0.05) return cd;
    return (b.edge.weight ?? 0) - (a.edge.weight ?? 0);
  });
}

/**
 * 展开某节点的一跳邻域，按关系类型分组。
 * 分组顺序刻意固定为「目录事实 → 词表关联 → 原文提及 → 统计推算」，
 * 让最硬的证据排在最前面。
 */
export function expandNode(id: string, groupLimit = DEFAULT_GROUP_LIMIT): GraphView | null {
  const rt = getRuntime();
  if (!rt) return null;
  const center = rt.nodeById.get(id);
  if (!center) return null;

  const buckets = new Map<string, RelatedItem[]>();
  /** 去重键：同一分组内同一邻居只出现一次（对称关系两个方向都存边时会撞上） */
  const seen = new Set<string>();
  for (const edge of rt.adjacency.get(id) ?? []) {
    const direction: 'out' | 'in' = edge.from === id ? 'out' : 'in';
    const otherId = direction === 'out' ? edge.to : edge.from;
    if (otherId === id) continue; // 自环（词表若误配）直接丢弃
    const node = rt.nodeById.get(otherId);
    if (!node) continue;

    const key = SYMMETRIC_TYPES.has(edge.type)
      ? edge.type
      : `${edge.type}\u0000${direction}`;
    const dedupe = `${key}\u0000${otherId}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const list = buckets.get(key);
    if (list) list.push({ node, edge, direction });
    else buckets.set(key, [{ node, edge, direction }]);
  }

  const ORDER: GraphEdgeType[] = [
    'part_of',
    'subclass_of',
    'related_to',
    'authored_by',
    'mentioned_in',
    'similar_work',
    'cooccurs_with',
    'has_tag',
    'depicts',
    'illustrates',
    'alias_of',
  ];

  const groups: RelationGroup[] = [];
  for (const type of ORDER) {
    const keys = SYMMETRIC_TYPES.has(type)
      ? ([[type, 'out'] as const])
      : ([[`${type}\u0000out`, 'out'], [`${type}\u0000in`, 'in']] as const);
    for (const [key, direction] of keys) {
      const items = buckets.get(key);
      if (!items || items.length === 0) continue;
      groups.push({
        type,
        label: groupLabel(type, direction, center.type),
        items: rankItems(items).slice(0, groupLimit),
        total: items.length,
      });
    }
  }

  // 提及总数在构建期截断过（node.works 是真实总数），如实告知用户
  const mentionGroup = groups.find(g => g.type === 'mentioned_in');
  const note =
    center.works && mentionGroup && center.works > mentionGroup.total
      ? `全库共 ${center.works} 部典籍提及，图中收录关联最强的 ${mentionGroup.total} 部`
      : undefined;

  return { center, groups, synthetic: false, note };
}

/** 以某部典籍为中心的邻域（阅读页与 Agent 用） */
export function graphForWork(bookId: string, groupLimit = DEFAULT_GROUP_LIMIT): GraphView | null {
  return expandNode(`work:${bookId}`, groupLimit);
}

/**
 * 词表未命中时的回退链路 —— 让「全库任意检索词」都能得到关系视图。
 *
 * 思路：关键词 → 命中的典籍 → 这些典籍在图上已有的概念与关联文献。
 * 这样冷僻词（如「醮壇」之外的偏门术语）不必先进词表也能看到关系，
 * 图谱因此覆盖全库而不是只覆盖策展过的那几十个词。
 *
 * 为什么先用书名检索再退到全文：全文检索需要把约 97MB 语料读进内存
 * （见 lib/fulltext-search.ts 的取舍说明），能省则省。
 */
export function relatedByKeyword(query: string, groupLimit = DEFAULT_GROUP_LIMIT): GraphView | null {
  const rt = getRuntime();
  if (!rt) return null;
  const q = query.trim();
  if (!q) return null;

  const byTitle = searchEntries(q, 1, groupLimit);
  const workIds =
    byTitle.total > 0
      ? byTitle.results.map(e => e.id)
      : searchFullText(q, 1, groupLimit).results.map(h => h.entry.id);

  if (workIds.length === 0) return null;

  const center: GraphNode = {
    id: `concept:__query__${q}`,
    type: 'concept',
    label: q,
    shortDef: '检索词。图谱词表中暂无此实体，以下关系由命中典籍反向汇总得出。',
  };

  const workItems: RelatedItem[] = [];
  /** 概念候选：出现在多部命中典籍中的实体权重更高 */
  const conceptScore = new Map<string, { node: GraphNode; edge: GraphEdge; hits: number }>();
  const similarScore = new Map<string, { node: GraphNode; edge: GraphEdge }>();

  for (const bookId of workIds) {
    const workNodeId = `work:${bookId}`;
    const workNode = rt.nodeById.get(workNodeId);
    if (!workNode) continue;

    workItems.push({
      node: workNode,
      edge: {
        from: center.id,
        to: workNodeId,
        type: 'mentioned_in',
        source: 'mention',
        // 由检索命中推导，非图谱既有边，置信度如实标低
        confidence: 0.6,
      },
      direction: 'out',
    });

    for (const edge of rt.adjacency.get(workNodeId) ?? []) {
      if (edge.type === 'mentioned_in' && edge.to === workNodeId) {
        const node = rt.nodeById.get(edge.from);
        if (!node || node.type === 'work') continue;
        const cur = conceptScore.get(node.id);
        if (cur) cur.hits++;
        else conceptScore.set(node.id, { node, edge, hits: 1 });
      } else if (edge.type === 'similar_work') {
        const otherId = edge.from === workNodeId ? edge.to : edge.from;
        if (workIds.some(w => `work:${w}` === otherId)) continue;
        const node = rt.nodeById.get(otherId);
        if (node && !similarScore.has(node.id)) similarScore.set(node.id, { node, edge });
      }
    }
  }

  const groups: RelationGroup[] = [];
  if (workItems.length > 0) {
    groups.push({
      type: 'mentioned_in',
      label: '检索命中典籍',
      items: workItems.slice(0, groupLimit),
      total: byTitle.total > 0 ? byTitle.total : workItems.length,
    });
  }

  const concepts = Array.from(conceptScore.values()).sort((a, b) => b.hits - a.hits);
  if (concepts.length > 0) {
    groups.push({
      type: 'cooccurs_with',
      label: '命中典籍中的关联本体',
      items: concepts.slice(0, groupLimit).map(c => ({
        node: c.node,
        edge: {
          from: center.id,
          to: c.node.id,
          type: 'cooccurs_with' as GraphEdgeType,
          source: 'cooccur' as const,
          confidence: 0.5,
          weight: c.hits,
        },
        direction: 'out' as const,
      })),
      total: concepts.length,
    });
  }

  // 按相似度排序：回退链路的延伸文献是二跳结果，不排序的话首屏会是随机命中
  const similar = Array.from(similarScore.values()).sort(
    (a, b) => (b.edge.weight ?? 0) - (a.edge.weight ?? 0),
  );
  if (similar.length > 0) {
    groups.push({
      type: 'similar_work',
      label: '延伸关联文献',
      items: similar.slice(0, groupLimit).map(s => ({ node: s.node, edge: s.edge, direction: 'out' as const })),
      total: similar.length,
    });
  }

  return {
    center,
    groups,
    synthetic: true,
    note: '词表中暂无此实体，以上关系由检索命中的典籍反向汇总，仅供探索参考。',
  };
}

/**
 * 搜索页与 /graph 页的统一入口：先按实体解析，未命中再走关键词回退。
 * 调用方无需关心走了哪条路径，只看 view.synthetic 决定是否加提示。
 */
export function graphViewForQuery(query: string, groupLimit = DEFAULT_GROUP_LIMIT): GraphView | null {
  const entity = resolveQuery(query);
  if (entity) return expandNode(entity.id, groupLimit);
  return relatedByKeyword(query, groupLimit);
}

/** 供 Agent 工具复用：把视图压成精简结构，避免把整图塞进模型上下文 */
export function summarizeView(view: GraphView, perGroup = 6) {
  return {
    center: { id: view.center.id, label: view.center.label, type: view.center.type, shortDef: view.center.shortDef },
    synthetic: view.synthetic,
    note: view.note,
    relations: view.groups.map(g => ({
      relation: g.label,
      total: g.total,
      items: g.items.slice(0, perGroup).map(it => ({
        id: it.node.id,
        label: it.node.label,
        type: it.node.type,
        confidence: it.edge.confidence,
        source: it.edge.source,
        weight: it.edge.weight,
        citations: it.edge.citations?.slice(0, 1),
      })),
    })),
  };
}

/** 典籍标题 → 图谱节点（Agent 拿到 bookId 时用；顺带校验该书存在于索引） */
export function workNodeForBook(bookId: string): GraphNode | null {
  if (!getEntryById(bookId)) return null;
  return getNode(`work:${bookId}`);
}
