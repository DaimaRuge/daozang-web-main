/**
 * 知识图谱数据模型 —— 图谱能力的接口契约单一来源。
 *
 * 为什么与 content-schema.ts 并列而不是塞进去：
 * 1. content-schema 描述「一部典籍内部的结构」（第二层），本文件描述
 *    「典籍之间、典籍与本体之间的关系」（第三层策展/抽取知识），
 *    两者生命周期不同 —— 原文与解析结果稳定，图谱会随词表与算法反复重建；
 * 2. 构建脚本（scripts/build-graph.ts）、运行时查询（lib/graph/query.ts）、
 *    可视化（components/graph/*）、Agent 工具都依赖这里，任何一方不得私自定义；
 * 3. 本文件零运行时依赖（不碰 fs），未来 Android / iOS 客户端可直接复用。
 *
 * 内容边界：图谱是第三层内容。任何一条边都必须能回答「凭什么这么连」——
 * 故每条边强制携带 source（来源）与 confidence（置信度），
 * 提及类边还携带 Citation（可点回原文的出处）。绝不改写第一层原文。
 */

/**
 * 节点类型。
 * work/category/subcategory/person/tag 由现有 index.json 物化而来；
 * concept/deity/sect/ritual/place 由人工策展词表引入；
 * image 为已通过来源审核的图像资产（AI 生成图不入公共图谱）。
 */
export type GraphNodeType =
  | 'work'        // 典籍
  | 'category'    // 部（三洞四辅）
  | 'subcategory' // 十二类
  | 'person'      // 人物（著者、传承者）
  | 'tag'         // 辅助标签（复用 entry-tags 规则）
  | 'concept'     // 概念、术语（符箓、内丹）
  | 'deity'       // 神祇
  | 'sect'        // 宗派
  | 'ritual'      // 科仪、法事
  | 'place'       // 洞天福地、宫观
  | 'image';      // 图像资产

/**
 * 关系类型。
 * 命名取「主语—关系—宾语」的可读方向，UI 的关系分组标题直接由此映射。
 */
export type GraphEdgeType =
  | 'part_of'       // 书 → 子类 → 部
  | 'authored_by'   // 书 → 人物
  | 'has_tag'       // 书 → 标签
  | 'alias_of'      // 别名 → 正名（词表内部）
  | 'subclass_of'   // 神符 → 符箓
  | 'related_to'    // 人工种子关联（符箓 — 咒诀）
  | 'mentioned_in'  // 实体 → 典籍（全库扫描所得，带出处）
  | 'cooccurs_with' // 实体 — 实体（同书共现，弱关系）
  | 'similar_work'  // 典籍 — 典籍（共享概念计算所得）
  | 'depicts'       // 图像 → 实体
  | 'illustrates';  // 图像 → 典籍/内容块

/**
 * 边的来源。UI 据此告知用户「这条关系是怎么来的」，
 * 也决定是否需要打「待考」标记。
 */
export type GraphEdgeSource =
  | 'catalog'    // 来自道藏目录本身（最可靠）
  | 'gazetteer'  // 人工策展词表
  | 'mention'    // 全库原文扫描
  | 'cooccur'    // 共现统计（弱）
  | 'similar'    // 相关度计算（弱）
  | 'human'      // 人工审核确认
  | 'llm';       // LLM 抽取（须进待审队列，当前未启用）

/** 原文出处：与 lib/agent/context.ts 的 Citation 同构，便于 Agent 直接引用 */
export interface GraphCitation {
  bookId: string;
  bookTitle: string;
  /** 内容块 ID：阅读器支持 /text/{bookId}#{blockId} 深链，可精确定位到段落 */
  blockId?: string;
  /** 命中处短引文（用于列表预览，长度受限以免变相复制原文） */
  quote?: string;
  /** 命中词在原文中的实际词形（语料为繁体，可能与查询词不同） */
  matchedTerm?: string;
}

export interface GraphNode {
  /** 形如 `work:82442e71287821e3`、`concept:fulu`，类型前缀保证跨类型唯一 */
  id: string;
  type: GraphNodeType;
  /** 展示名（繁体优先，与语料一致） */
  label: string;
  /** 简体或异体别名，供检索解析（不参与展示） */
  aliases?: string[];
  /**
   * 一句话释义。属第三层策展内容，UI 必须标注「词表释义」，
   * 不得让用户误以为是典籍原文。
   */
  shortDef?: string;
  /** 该实体在全库被提及的典籍总数（用于节点权重/字号） */
  works?: number;
  /** work 节点专属：便于 UI 直接展示而无需再查 index */
  meta?: {
    category?: string;
    subcategory?: string;
    author?: string;
    lineCount?: number;
    /** image 节点：图片地址与 AI 标记 */
    imageUrl?: string;
    aiGenerated?: boolean;
  };
}

export interface GraphEdge {
  from: string;
  to: string;
  type: GraphEdgeType;
  source: GraphEdgeSource;
  /** 0~1；低于 LOW_CONFIDENCE 的边 UI 标「待考」 */
  confidence: number;
  /** 权重：提及次数 / 共现书数 / 相似度，供排序与连线粗细 */
  weight?: number;
  /** 提及类边的原文出处（最多保留少量样本，避免产物膨胀） */
  citations?: GraphCitation[];
}

/** 构建产物（public/data/graph.json）。运行时只读，模块级缓存。 */
export interface KnowledgeGraph {
  version: number;
  buildTime: string;
  /** 构建统计，便于运维与回归对比 */
  stats: {
    nodes: number;
    edges: number;
    works: number;
    entities: number;
    scannedChars: number;
    buildMs: number;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** 别名（含简繁变体）→ 节点 id，运行时解析查询词用 */
  aliasIndex: Record<string, string>;
}

/** 词表条目（data/graph/gazetteer.json 的元素），人工策展、可审可改 */
export interface GazetteerEntry {
  /** 不含类型前缀的短 id，如 `fulu`；节点 id 由 `${type}:${id}` 生成 */
  id: string;
  type: Exclude<GraphNodeType, 'work' | 'category' | 'subcategory' | 'tag' | 'image'>;
  label: string;
  /** 用于全库扫描的匹配词形（必须包含 label 本身的繁体形态） */
  aliases: string[];
  shortDef: string;
  /** 人工种子边：指向其他词表条目的短 id 或带前缀的节点 id */
  seedEdges?: Array<{
    to: string;
    type: Extract<GraphEdgeType, 'subclass_of' | 'related_to' | 'part_of'>;
  }>;
}

// ---------- 查询视图模型 ----------
//
// 为什么视图模型也放在本文件：可视化组件（客户端）与查询层（服务端，依赖 fs）
// 必须共享这套结构。若把它们定义在 lib/graph/query.ts 里，客户端组件为拿类型
// 就得 import 那个模块，打包器会把 fs 一路拖进浏览器包。

/** 中心点的一个邻居：节点 + 连接它的那条边 + 方向 */
export interface RelatedItem {
  node: GraphNode;
  edge: GraphEdge;
  /** out = 中心指向邻居；in = 邻居指向中心。UI 据此调整措辞 */
  direction: 'out' | 'in';
}

export interface RelationGroup {
  type: GraphEdgeType;
  /** 分组标题（已按方向调整措辞） */
  label: string;
  items: RelatedItem[];
  /** 该关系的实际总数，可能大于 items 长度（说明被截断） */
  total: number;
}

export interface GraphView {
  center: GraphNode;
  groups: RelationGroup[];
  /** true 表示中心点是检索词而非图谱实体（词表未命中时的回退路径） */
  synthetic: boolean;
  /** 面向用户的说明，例如提及总数与截断情况 */
  note?: string;
}

/** 图谱产物版本：schema 或构建算法变更时递增，运行时可据此提示重建 */
export const GRAPH_VERSION = 1;

/** 边的来源 → 面向用户的说明。UI 必须如实告知「这条关系怎么来的」 */
export const EDGE_SOURCE_LABELS: Record<GraphEdgeSource, string> = {
  catalog: '道藏目录',
  gazetteer: '词表策展',
  mention: '原文提及',
  cooccur: '共现推算',
  similar: '相关度计算',
  human: '人工审定',
  llm: 'AI 抽取',
};

/** 关系类型 → 中文分组标题（UI 与 Agent 共用同一套措辞） */
export const EDGE_LABELS: Record<GraphEdgeType, string> = {
  part_of: '所属部类',
  authored_by: '著者',
  has_tag: '主题标签',
  alias_of: '别名',
  subclass_of: '上位概念',
  related_to: '相关概念',
  mentioned_in: '见于典籍',
  cooccurs_with: '常同现概念',
  similar_work: '关联文献',
  depicts: '图像所绘',
  illustrates: '配图',
};

/** 节点类型 → 中文名（图例与侧栏共用） */
export const NODE_TYPE_LABELS: Record<GraphNodeType, string> = {
  work: '典籍',
  category: '部',
  subcategory: '类',
  person: '人物',
  tag: '标签',
  concept: '概念',
  deity: '神祇',
  sect: '宗派',
  ritual: '科仪',
  place: '地域',
  image: '图像',
};

/** 拼装节点 id：所有生产/消费方必须走这里，避免前缀写法漂移 */
export function nodeId(type: GraphNodeType, raw: string): string {
  return `${type}:${raw}`;
}

/**
 * 图谱页地址：真实实体用 ?id=（稳定、可精确定位），
 * 回退产生的检索词中心点用 ?q=（它并非图上节点，用 id 会 404）。
 */
export function graphHrefForView(view: GraphView): string {
  return view.synthetic
    ? `/graph?q=${encodeURIComponent(view.center.label)}`
    : `/graph?id=${encodeURIComponent(view.center.id)}`;
}

/** 解析节点 id，非法输入返回 null（运行时入参不可信） */
export function parseNodeId(id: string): { type: GraphNodeType; raw: string } | null {
  const i = id.indexOf(':');
  if (i <= 0) return null;
  const type = id.slice(0, i) as GraphNodeType;
  if (!(type in NODE_TYPE_LABELS)) return null;
  return { type, raw: id.slice(i + 1) };
}
