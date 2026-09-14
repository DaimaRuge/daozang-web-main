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

/**
 * 标签排版常量。渲染层（GraphCanvas）必须复用布局给出的字号 ——
 * 碰撞检测按同一套数字算包围盒，若两边字号不一致，避让结果就是错的。
 *
 * 字号之所以可配：SVG 按 viewBox 等比缩放，窄屏画布小、缩放比接近 1，
 * 需要比宽屏更大的 viewBox 字号才能让实际显示字号追上正文。
 */
export const DEFAULT_LABEL_FONT_SIZE = 11;
/** 标签基线相对节点圆心下方的距离（不含避让偏移） */
export const LABEL_BASE_DY = 13;

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
  /** 标签避让偏移（相对 LABEL_BASE_DY），由碰撞检测算出 */
  labelDy: number;
  /**
   * 标签锚点横坐标。通常等于节点的 x，但靠边的节点会被钳制回画布内 ——
   * 标签略微偏离自己的节点，总比被画布裁掉半截要好。
   */
  labelX: number;
  /** 画布上实际显示的标签文本（已截断，布局据此算宽度） */
  displayLabel: string;
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
  /** 标签字号（viewBox 单位）。渲染层必须用这个值，不得另设 */
  labelFontSize: number;
}

export interface LayoutOptions {
  width?: number;
  height?: number;
  /** 画布上最多摆放的邻居数（超出的只在列表视图里出现） */
  maxNodes?: number;
  /** 标签字号（viewBox 单位）；窄屏应给更大值以抵消缩放 */
  labelFontSize?: number;
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
  const labelFontSize = options.labelFontSize ?? DEFAULT_LABEL_FONT_SIZE;

  const cx = width / 2;
  const cy = height / 2;
  // 椭圆半径：边距必须随画布尺寸缩放。此前横向边距写死 110px，
  // 在窄屏 400 宽的画布上只剩 90 的横向半径，节点会挤进中心标签横跨的区域。
  const rx = width / 2 - clamp(width * 0.14, 48, 120);
  const ry = height / 2 - clamp(height * 0.09, 40, 70);

  // 中心标签字号更大，长书名极易横穿内圈节点，故按可用横向空间限制字数
  const centerFs = centerFontSize(labelFontSize);
  const centerMaxChars = Math.min(12, Math.max(4, Math.floor((rx * 0.9) / centerFs)));

  const center: PositionedNode = {
    node: view.center,
    groupIndex: -1,
    x: cx,
    y: cy,
    r: 13,
    confidence: 1,
    relationLabel: '中心',
    labelDy: 5,
    labelX: cx,
    displayLabel: truncateLabel(view.center.label, centerMaxChars),
  };

  // 按比例把画布名额分给各分组；顺序靠前的组优先保底 1 个
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

    // 条目多的分组交错三圈而不是两圈：典籍标题动辄七八个字，
    // 只错开两层时相邻标签仍会横向压盖
    const rings = count > 6 ? [1, 0.78, 0.89] : [1, 0.82];

    for (let i = 0; i < count; i++) {
      const item = group.items[i];
      // 扇区内均分角度；单节点时置于扇区中线
      const t = count === 1 ? 0.5 : (i + 0.5) / count;
      const angle = angleCursor + sectorSpan * t;
      const radial = tier * rings[i % rings.length];
      nodes.push({
        node: item.node,
        groupIndex: gi,
        x: cx + Math.cos(angle) * rx * radial,
        y: cy + Math.sin(angle) * ry * radial,
        r: nodeRadius(item.node, item.edge.weight),
        confidence: item.edge.confidence,
        relationLabel: group.label,
        labelDy: 0,
        labelX: cx + Math.cos(angle) * rx * radial,
        displayLabel: nodeDisplayLabel(item.node, item.node.type === 'work' ? 8 : 9),
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

  resolveLabelCollisions(nodes, center, labelFontSize, width, height);

  return { width, height, center, nodes, sectors, labelFontSize };
}

/**
 * 标签包围盒（用于碰撞检测与测试）。
 * 中文字形宽度约等于字号，故按字数估算；中心点字号更大，单独传入。
 */
export function labelBox(n: PositionedNode, fontSize: number) {
  const w = n.displayLabel.length * fontSize;
  const baseline = n.y + n.r + LABEL_BASE_DY + n.labelDy;
  const lineHeight = fontSize * 1.28;
  return {
    x1: n.labelX - w / 2,
    x2: n.labelX + w / 2,
    y1: baseline - lineHeight * 0.8,
    y2: baseline + lineHeight * 0.2,
  };
}

/** 把标签锚点钳制回画布内（标签过宽时居中，交由截断兜底处理） */
function clampLabelX(n: PositionedNode, fontSize: number, width: number): number {
  const half = (n.displayLabel.length * fontSize) / 2 + 3;
  return half * 2 >= width ? width / 2 : clamp(n.x, half, width - half);
}

export function labelsOverlap(
  a: ReturnType<typeof labelBox>,
  b: ReturnType<typeof labelBox>,
): boolean {
  return Math.min(a.x2, b.x2) > Math.max(a.x1, b.x1) && Math.min(a.y2, b.y2) > Math.max(a.y1, b.y1);
}

/** 中心点字号相对邻居标签放大，视觉上确立中心地位 */
export function centerFontSize(labelFontSize: number): number {
  return Math.round(labelFontSize * 1.36);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 节点圆的包围盒：标签不得压在任何节点圆上，否则看着像渲染错乱 */
function circleBox(n: PositionedNode) {
  return { x1: n.x - n.r, x2: n.x + n.r, y1: n.y - n.r, y2: n.y + n.r };
}

/**
 * 标签避让：把标签沿纵向挪开，使其既不压盖别的标签，也不压在节点圆上。
 *
 * 为什么需要这一步：分扇区 + 交错多圈已经能让大多数中心点的标签互不相干，
 * 但道藏书名动辄七八字（「洞玄靈寶三師名諱形狀居觀方所文」），
 * 在典籍密集的扇区里仍会压盖 —— 全图核算显示约 6% 的中心点存在标签互压，
 * 窄屏上还会出现长标签横穿邻近节点圆的情况。
 * 与其调参碰运气，不如在布局末尾做一次确定性避让：按候选偏移逐个试，
 * 取第一个既不撞标签也不撞节点圆的位置；候选偏移上下交替、幅度递增，
 * 保证标签始终紧邻自己的节点。车道全被占满时才退而缩短标签。
 */
function resolveLabelCollisions(
  nodes: PositionedNode[],
  center: PositionedNode,
  labelFontSize: number,
  width: number,
  height: number,
): void {
  // 候选偏移按字号成比例（字号变大时避让幅度同步变大），上下交替、幅度递增。
  // 洞天福地一类中圈节点变密时，短标签截不断，需要比 5 档更深的车道才能越过邻圆。
  const step = labelFontSize * 1.28;
  const candidates = [0];
  for (let k = 1; k <= 8; k++) {
    candidates.push(step * k, -step * (k + 0.9));
  }

  // 先排布靠上的标签，让避让方向整体一致，避免互相推挤
  const order = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed = [labelBox(center, centerFontSize(labelFontSize))];
  // 节点圆是固定障碍物；自己的圆要排除，否则标签紧贴在圆下方就永远「撞」
  const circles = new Map<PositionedNode, ReturnType<typeof circleBox>>(
    [center, ...nodes].map(n => [n, circleBox(n)]),
  );

  /** 在各纵向车道上试放当前标签，找到既不撞标签也不撞节点圆的位置即返回 true */
  const tryLanes = (n: PositionedNode): boolean => {
    // 钳制必须在碰撞检测之前：检测要基于标签最终画在哪里
    n.labelX = clampLabelX(n, labelFontSize, width);
    for (const dy of candidates) {
      n.labelDy = dy;
      const box = labelBox(n, labelFontSize);
      // 避让不能把标签挤出画布：越界的车道直接跳过，宁可再缩短标签
      if (box.y1 < 0 || box.y2 > height) continue;
      if (placed.some(p => labelsOverlap(box, p))) continue;
      let hitsCircle = false;
      for (const [owner, c] of circles) {
        if (owner === n) continue;
        if (labelsOverlap(box, c)) {
          hitsCircle = true;
          break;
        }
      }
      if (!hitsCircle) return true;
    }
    return false;
  };

  for (const n of order) {
    const full = n.displayLabel;

    // 先用完整标签试各个车道；车道都被占满时才退而缩短标签
    // （窄屏上长书名密集时会走到这一步：宁可多截几个字，也不能让标签叠在一起）
    if (!tryLanes(n)) {
      let settled = false;
      for (let maxLen = full.length - 2; maxLen >= 3 && !settled; maxLen -= 2) {
        n.displayLabel = truncateLabel(full, maxLen);
        settled = tryLanes(n);
      }
      // 极端情况下所有车道都不可用：至少保证标签留在画布内
      if (!settled) {
        const box = labelBox(n, labelFontSize);
        if (box.y2 > height) n.labelDy -= box.y2 - height;
        else if (box.y1 < 0) n.labelDy -= box.y1;
      }
    }

    placed.push(labelBox(n, labelFontSize));
  }
}

/**
 * 名额分配：先按分组顺序各给 1 个保底（可靠关系在前），剩余按条目数比例分配。
 * 这样「只有 1 条的目录关系」不会被「60 条的提及关系」挤掉。
 * 分组数多于 maxNodes 时，靠后的组拿不到名额，总节点数仍不超过上限。
 */
function allocateQuota(groups: RelationGroup[], maxNodes: number): number[] {
  if (groups.length === 0) return [];
  const quota = groups.map(() => 0);
  let remaining = Math.max(0, maxNodes);

  for (let i = 0; i < groups.length && remaining > 0; i++) {
    quota[i] = 1;
    remaining--;
  }

  const hungry = groups.map((g, i) => ({ i, want: g.items.length - quota[i] }));
  const totalWant = hungry.reduce((a, b) => a + Math.max(0, b.want), 0);
  if (totalWant > 0 && remaining > 0) {
    const budget = remaining;
    for (const h of hungry) {
      if (remaining <= 0 || h.want <= 0) continue;
      const share = Math.min(h.want, remaining, Math.round((h.want / totalWant) * budget));
      quota[h.i] += share;
      remaining -= share;
    }
  }

  for (const h of hungry) {
    if (remaining <= 0) break;
    const room = groups[h.i].items.length - quota[h.i];
    if (room <= 0) continue;
    const add = Math.min(room, remaining);
    quota[h.i] += add;
    remaining -= add;
  }

  for (let i = 0; i < quota.length; i++) {
    quota[i] = Math.min(quota[i], groups[i].items.length);
  }
  return quota;
}

/** 标签截断：中文标签过长会撑破扇区，统一截到 9 字 */
export function truncateLabel(label: string, max = 9): string {
  return label.length > max ? `${label.slice(0, max)}…` : label;
}

/**
 * 画布上的节点显示名。
 *
 * 为什么要额外处理：部分典籍的 index 标题带着文件名残留
 * （如「續道藏-漢天師世家-明-張鉞」，属已知的 59 个文件名解析边角案例），
 * 直接截断会得到「續道藏-漢天師世…」这种毫无信息量的标签。
 * 这里只在展示层剥掉丛集前缀与朝代-作者后缀，索引与图谱数据本身不动。
 */
export function nodeDisplayLabel(node: GraphNode, max = 9): string {
  let label = node.label;
  if (node.type === 'work') {
    label = label.replace(/^[續续]道藏[-—]/, '');
    label = label.replace(/-(?:[南北朝宋元明清隋唐五代晉漢秦周商夏]|五代)-[\u4e00-\u9fff]{1,8}$/, '');
  }
  return truncateLabel(label, max);
}
