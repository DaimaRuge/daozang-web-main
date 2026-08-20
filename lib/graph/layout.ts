/**
 * 图谱径向布局（纯函数，无 DOM 依赖）。
 *
 * 为什么自己算坐标而不引入 d3 / cytoscape：
 * 1. 项目基线是「无 UI 组件库、不轻易加框架」，一张以中心点为核心的
 *    分扇区径向图用不到通用图布局引擎；
 * 2. 力导向布局每次结果都不同，服务端渲染与客户端会对不上，
 *    且节点会互相挤压 —— 而按「关系类型分扇区」摆放本身就在传达信息：
 *    同一方向上的邻居是同一种关系；
 * 3. 纯函数可单测、可被 React Native / Flutter 端复用同一套坐标逻辑。
 *
 * 布局规则：中心点居中；每个关系分组按其条目数分配一个角度扇区；
 * 扇区内条目沿两条弧线交错摆放（避免中文标签互相压盖）。
 */

import { GraphNode, GraphView, RelationGroup } from './schema';

export interface PositionedNode {
  node: GraphNode;
  /** 所属分组下标；-1 为中心点 */
  groupIndex: number;
  x: number;
  y: number;
  /** 节点半径（按关系强度与类型微调，用于视觉层级） */
  r: number;
  /** 该邻居对应边的置信度，UI 用于「待考」标记与连线透明度 */
  confidence: number;
  /** 关系措辞（用于 title/aria 描述） */
  relationLabel: string;
}

export interface SectorLabel {
  groupIndex: number;
  label: string;
  /** 扇区标题锚点坐标 */
  x: number;
  y: number;
  /** 扇区中线角度（弧度），用于文字对齐方向 */
  angle: number;
  total: number;
  shown: number;
}

export interface GraphLayout {
  width: number;
  height: number;
  center: PositionedNode;
  nodes: PositionedNode[];
  sectors: SectorLabel[];
}

export interface LayoutOptions {
  width?: number;
  height?: number;
  /** 画布上最多摆放的邻居数（超出的只在列表视图里出现） */
  maxNodes?: number;
}

/** 关系类型 → 距中心的相对远近。目录事实近，统计推算远 */
const TIER: Record<string, number> = {
  part_of: 0.62,
  subclass_of: 0.62,
  authored_by: 0.68,
  related_to: 0.72,
  has_tag: 0.72,
  cooccurs_with: 0.8,
  mentioned_in: 1,
  similar_work: 1,
  depicts: 0.86,
  illustrates: 0.86,
  alias_of: 0.6,
};

/** 节点半径：典籍略小、本体略大，权重高者再加一点，形成可读的视觉层级 */
function nodeRadius(node: GraphNode, weight?: number): number {
  const base = node.type === 'work' ? 6 : node.type === 'image' ? 7 : 8;
  const boost = weight && weight > 0 ? Math.min(4, Math.log2(1 + weight)) : 0;
  return Math.round((base + boost) * 10) / 10;
}

export function computeLayout(view: GraphView, options: LayoutOptions = {}): GraphLayout {
  const width = options.width ?? 900;
  const height = options.height ?? 620;
  const maxNodes = options.maxNodes ?? 34;

  const cx = width / 2;
  const cy = height / 2;
  // 椭圆半径：留出边距给标签，横向比纵向宽松（中文标签是横排的）
  const rx = width / 2 - 110;
  const ry = height / 2 - 64;

  const center: PositionedNode = {
    node: view.center,
    groupIndex: -1,
    x: cx,
    y: cy,
    r: 13,
    confidence: 1,
    relationLabel: '中心',
  };

  // 按比例把画布名额分给各分组，保证每组至少有 1 个（否则某类关系会整组消失）
  const groups = view.groups.filter(g => g.items.length > 0);
  const quota = allocateQuota(groups, maxNodes);

  const nodes: PositionedNode[] = [];
  const sectors: SectorLabel[] = [];

  const shownTotal = quota.reduce((a, b) => a + b, 0) || 1;
  // 从正上方偏左起画，顺时针铺开；留一点起始偏移避免第一个节点正压在顶端
  let angleCursor = -Math.PI / 2 + 0.12;

  groups.forEach((group, gi) => {
    const count = quota[gi];
    if (count === 0) return;
    const sectorSpan = (Math.PI * 2 * count) / shownTotal;
    const tier = TIER[group.type] ?? 0.85;

    for (let i = 0; i < count; i++) {
      const item = group.items[i];
      // 扇区内均分角度；单节点时置于扇区中线
      const t = count === 1 ? 0.5 : (i + 0.5) / count;
      const angle = angleCursor + sectorSpan * t;
      // 交错内外两圈，避免相邻标签横向重叠
      const radial = tier * (i % 2 === 0 ? 1 : 0.82);
      nodes.push({
        node: item.node,
        groupIndex: gi,
        x: cx + Math.cos(angle) * rx * radial,
        y: cy + Math.sin(angle) * ry * radial,
        r: nodeRadius(item.node, item.edge.weight),
        confidence: item.edge.confidence,
        relationLabel: group.label,
      });
    }

    const midAngle = angleCursor + sectorSpan / 2;
    sectors.push({
      groupIndex: gi,
      label: group.label,
      x: cx + Math.cos(midAngle) * rx * 1.08,
      y: cy + Math.sin(midAngle) * ry * 1.1,
      angle: midAngle,
      total: group.total,
      shown: count,
    });

    angleCursor += sectorSpan;
  });

  return { width, height, center, nodes, sectors };
}

/**
 * 名额分配：先给每组 1 个保底，剩余按条目数比例分配。
 * 这样「只有 1 条的目录关系」不会被「60 条的提及关系」挤掉 ——
 * 而恰恰是那条目录关系最可靠、最该出现在图上。
 */
function allocateQuota(groups: RelationGroup[], maxNodes: number): number[] {
  if (groups.length === 0) return [];
  const quota = groups.map(() => 0);
  let remaining = Math.max(maxNodes, groups.length);

  for (let i = 0; i < groups.length && remaining > 0; i++) {
    quota[i] = 1;
    remaining--;
  }

  const hungry = groups.map((g, i) => ({ i, want: g.items.length - quota[i] }));
  const totalWant = hungry.reduce((a, b) => a + Math.max(0, b.want), 0);
  if (totalWant > 0) {
    for (const h of hungry) {
      if (remaining <= 0 || h.want <= 0) continue;
      const share = Math.min(h.want, Math.round((h.want / totalWant) * remaining));
      quota[h.i] += share;
    }
  }

  // 修正取整误差，且不超过各组实际条目数
  for (let i = 0; i < quota.length; i++) {
    quota[i] = Math.min(quota[i], groups[i].items.length);
  }
  return quota;
}

/** 标签截断：中文标签过长会撑破扇区，统一截到 9 字 */
export function truncateLabel(label: string, max = 9): string {
  return label.length > max ? `${label.slice(0, max)}…` : label;
}
