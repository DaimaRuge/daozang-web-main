/**
 * 自动术语的类型归属（本体分类）。
 *
 * 自动抽出的只是「像术语的字符串」，图谱还需要知道它是概念、神祇、宗派、
 * 科仪、人物还是地域。两条互补的判据：
 *
 * 1. 构词规则：道教术语的类型信息大量固化在词尾（「…天尊」必是神名，
 *    「…真人」必是人物，「…燈儀」必是科仪）。规则命中即高置信度，
 *    因为这是构词法而非猜测。
 * 2. 分布相似度 kNN：规则不命中时，看它在哪些典籍里出现 ——
 *    与「符籙」共现分布相近的术语，大概率也属符箓语义域。
 *    以人工策展的实体作近邻样本，按文档集合的 Jaccard 相似度加权投票。
 *
 * 两条都不成立时归为 concept 且置信度压低，由 UI 标「待审」，
 * 绝不假装分类可靠 —— 分类错了比不分类更误导读者。
 */

import { GraphNodeType } from './schema';

/** 可由自动流程赋予的类型（work/category/subcategory/tag/image 只能来自目录与资产） */
export type AutoNodeType = Extract<
  GraphNodeType,
  'concept' | 'deity' | 'sect' | 'ritual' | 'place' | 'person'
>;

export interface TypeVerdict {
  type: AutoNodeType;
  /** 0~1；低于 LOW_CONFIDENCE 的分类在界面上标「待审」 */
  confidence: number;
  /** 判据说明，写入产物便于人工复核时定位问题规则 */
  basis: string;
  /**
   * 分布近邻给出的类型提示（不作为节点类型采用）。
   *
   * 为什么只当提示：文档分布能说明「与符箓语义域相关」，但说不清它是科仪、
   * 概念还是神名 —— 拿它定类型会把「三洞四輔」标成神祇。类型标错比不标更误导，
   * 故仅记录下来供后续人工审核参考。
   */
  hint?: { type: AutoNodeType; purity: number; neighbors: number };
}

/**
 * 构词规则表。顺序即优先级：先判神名（「天尊」「帝君」），
 * 再判人物（「真人」「天師」），避免「玄天上帝」被人物规则抢走。
 */
const MORPHOLOGY_RULES: Array<{ type: AutoNodeType; pattern: RegExp; label: string }> = [
  // 神名/人物词尾必须接前缀：光「天尊」「真人」是类型通名，不是实体。
  { type: 'deity', pattern: /.+(天尊|大帝|帝君|元君|真君|星君|神君|老君|天王|王母|夫人|真宰|聖母)$/, label: '神名词尾' },
  { type: 'person', pattern: /.+(真人|先生|道士|居士|祖師|天師|散人|隱居|處士)$/, label: '人物词尾' },
  // 科仪词本身就是术语（燈儀、齋醮），允许整词命中。
  { type: 'ritual', pattern: /(燈儀|科儀|道場|法會|法事|齋儀|醮儀|懺法|齋法|儀範|齋醮|懺儀)$/, label: '科仪词尾' },
  { type: 'place', pattern: /.+(洞天|福地|名山|宮觀)$/, label: '地域词尾' },
  { type: 'place', pattern: /^[\u4e00-\u9fff]{1,3}(山|嶽|峰|巖|洞府)$/, label: '山川词形' },
  { type: 'sect', pattern: /.+(道派|法派|一派|宗壇)$/, label: '宗派词尾' },
];

export function typeByMorphology(term: string): TypeVerdict | null {
  for (const rule of MORPHOLOGY_RULES) {
    if (rule.pattern.test(term)) {
      // 构词法是硬信号，但仍留出错的余地（如「北斗七元君」之类歧义构词）
      return { type: rule.type, confidence: 0.85, basis: `构词规则·${rule.label}` };
    }
  }
  return null;
}

export interface TypedSeed {
  type: AutoNodeType;
  /** 该实体出现于哪些典籍 */
  docs: Set<string>;
}

/** 文档集合的 Jaccard 相似度：两个术语在多大程度上出现在同一批典籍中 */
export function docJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const d of small) if (large.has(d)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * 分布相似度 kNN 分类。
 *
 * 为什么用 Jaccard 而不是余弦：这里关心的是「出现在同一批书里」这种集合关系，
 * 词频权重反而会让长篇大部头主导相似度。
 */
export function neighborHint(
  docs: Set<string>,
  seeds: TypedSeed[],
  k = 5,
  minSimilarity = 0.06,
): { type: AutoNodeType; purity: number; neighbors: number } | null {
  const sims = seeds
    .map(s => ({ type: s.type, sim: docJaccard(docs, s.docs) }))
    .filter(s => s.sim >= minSimilarity)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k);

  if (sims.length === 0) return null;

  const votes = new Map<AutoNodeType, number>();
  let total = 0;
  for (const s of sims) {
    votes.set(s.type, (votes.get(s.type) ?? 0) + s.sim);
    total += s.sim;
  }

  let best: AutoNodeType = 'concept';
  let bestWeight = 0;
  for (const [type, w] of votes) {
    if (w > bestWeight) {
      best = type;
      bestWeight = w;
    }
  }

  return {
    type: best,
    purity: total > 0 ? bestWeight / total : 0,
    neighbors: sims.length,
  };
}

/**
 * 综合判定：构词规则说了算，规则不命中就老实归为「概念」。
 * 分布近邻只作为提示随产物记录，不参与定类型（理由见 TypeVerdict.hint）。
 */
export function assignType(term: string, docs: Set<string>, seeds: TypedSeed[]): TypeVerdict {
  const hint = neighborHint(docs, seeds) ?? undefined;
  const byRule = typeByMorphology(term);
  if (byRule) return { ...byRule, hint };
  return {
    type: 'concept',
    // 「概念」是自动术语的兜底桶：术语本身可信，但类型未经判定，
    // 故置信度取中间值 —— 既不标待审刷屏，也不假装类型已核实
    confidence: 0.6,
    basis: '未见类型构词标记，归为概念',
    hint,
  };
}
