/**
 * 待审关系提案（第三期 stand-off）。
 *
 * 为什么不写进 graph.json.gz：抽取规则或模型一变就要重扫 3500 万字；
 * 提案是「建议增加的边」，与人工 overrides 一样叠在产物外面。
 * 确认/否决仍走 overrides.json：确认 → human；否决 → 运行时删边。
 *
 * source 只允许 extract（规则）或 llm（模型）。不得标成 gazetteer / morphology。
 */

import fs from 'fs';
import path from 'path';
import type { GraphEdge, GraphEdgeSource, GraphEdgeType, KnowledgeGraph } from './schema';

export interface GraphProposalEdge {
  from: string;
  to: string;
  type: GraphEdgeType;
  source: Extract<GraphEdgeSource, 'extract' | 'llm'>;
  confidence: number;
  weight?: number;
}

export interface GraphProposalsFile {
  version: 1;
  generatedAt?: string;
  method?: string;
  edges: GraphProposalEdge[];
}

const PROPOSALS_PATH = path.join(process.cwd(), 'data', 'graph', 'proposals.json');

const EMPTY: GraphProposalsFile = { version: 1, edges: [] };

let cache: GraphProposalsFile | null = null;

export function loadGraphProposals(): GraphProposalsFile {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(fs.readFileSync(PROPOSALS_PATH, 'utf-8')) as GraphProposalsFile;
    cache = parsed?.version === 1 && Array.isArray(parsed.edges) ? parsed : { ...EMPTY };
  } catch {
    cache = { ...EMPTY };
  }
  return cache;
}

export function resetGraphProposalsCache(): void {
  cache = null;
}

function edgeKey(e: Pick<GraphEdge, 'from' | 'to' | 'type'>): string {
  return `${e.from}|${e.type}|${e.to}`;
}

/** 把提案边并入图谱；已有同向同类型边不覆盖产物里的证据 */
export function applyGraphProposals(
  graph: KnowledgeGraph,
  proposals: GraphProposalsFile = loadGraphProposals(),
): KnowledgeGraph {
  if (!proposals.edges.length) return graph;
  const existing = new Set(graph.edges.map(edgeKey));
  const extra: GraphEdge[] = [];
  for (const p of proposals.edges) {
    if (p.source !== 'extract' && p.source !== 'llm') continue;
    if (p.type !== 'related_to' && p.type !== 'subclass_of') continue;
    if (!(p.confidence > 0 && p.confidence < 1)) continue;
    if (!p.from || !p.to || p.from === p.to) continue;
    if (existing.has(edgeKey(p))) continue;
    existing.add(edgeKey(p));
    extra.push({
      from: p.from,
      to: p.to,
      type: p.type,
      source: p.source,
      confidence: p.confidence,
      weight: p.weight,
    });
  }
  if (extra.length === 0) return graph;
  const edges = graph.edges.concat(extra);
  return {
    ...graph,
    edges,
    stats: { ...graph.stats, edges: edges.length },
  };
}

const LEXICON = new Set(['concept', 'deity', 'person', 'place', 'ritual', 'sect']);

/** 神名/科仪通名不参与「共享用字」判断，否则天尊之间全被当成相关 */
const TITLE_AFFIX = /天尊|真君|大帝|帝君|夫人|元君|星君|真人|先生|天師|祖師|隱居|法事|科儀|儀範|[山嶽峰巖洞府宮觀道場]/;

function strippedLabel(label: string): string {
  return label.replace(TITLE_AFFIX, '');
}

function sharesContentChar(a: string, b: string): boolean {
  const x = strippedLabel(a);
  const y = strippedLabel(b);
  if (x.length < 2 || y.length < 2) return false;
  return [...x].some(ch => y.includes(ch));
}

/** 去掉通名后同形或互相包含：陶隱居↔陶弘景、設醮儀↔醮壇 */
function isNearAlias(a: string, b: string): boolean {
  const x = strippedLabel(a);
  const y = strippedLabel(b);
  if (x.length < 1 || y.length < 1) return false;
  if (x === y) return true;
  if ((x.length >= 2 && y.includes(x)) || (y.length >= 2 && x.includes(y))) return true;
  // 通名至少剥掉两字后剩一字（陶隱居→陶）：对侧以该字起头才认。
  // 「三洞」只剥掉字符类里的「洞」剩「三」，不得因此挂到「三清」。
  if (x.length === 1 && a.length - x.length >= 2 && y.startsWith(x)) return true;
  if (y.length === 1 && b.length - y.length >= 2 && x.startsWith(y)) return true;
  return false;
}

function typesCompatibleForExtract(a: string, b: string): boolean {
  if (a === b && LEXICON.has(a)) return true;
  return (a === 'ritual' && b === 'concept') || (a === 'concept' && b === 'ritual');
}

/**
 * 从已有共现里抽出「策展 ↔ 自动」且尚无策展/构词边的 related_to 候选。
 * 这些边置信度压在待考线以下，必须进审核队列，不得直接当词表事实。
 */
export function extractRelationProposals(
  graph: KnowledgeGraph,
  limit = 60,
): GraphProposalEdge[] {
  const nodeById = new Map(graph.nodes.map(n => [n.id, n]));
  const hard = new Set<string>();
  for (const e of graph.edges) {
    if (e.type === 'subclass_of' || e.type === 'related_to') {
      hard.add(`${e.from}|${e.to}`);
      hard.add(`${e.to}|${e.from}`);
    }
  }

  const scored: Array<GraphProposalEdge & { w: number }> = [];
  for (const e of graph.edges) {
    if (e.type !== 'cooccurs_with') continue;
    const a = nodeById.get(e.from);
    const b = nodeById.get(e.to);
    if (!a || !b) continue;
    if (!typesCompatibleForExtract(a.type, b.type)) continue;
    const origins = [a.origin, b.origin];
    if (!origins.includes('curated') || !origins.includes('auto')) continue;
    const curated = a.origin === 'curated' ? a : b;
    const near = isNearAlias(a.label, b.label);
    const share = sharesContentChar(a.label, b.label);
    if (!near && !share) continue;
    // 广布概念的「共享用字」边会污染相关概念；近义别名凭词形，可放宽
    if (!near && (curated.works ?? 0) > 420) continue;
    if (hard.has(`${a.id}|${b.id}`)) continue;
    const w = e.weight ?? 0;
    if (w < (near ? 2 : 4)) continue;
    scored.push({
      from: a.origin === 'auto' ? a.id : b.id,
      to: a.origin === 'curated' ? a.id : b.id,
      type: 'related_to',
      source: 'extract',
      confidence: near ? 0.62 : 0.55,
      weight: w,
      w: near ? w + 1000 : w,
    });
  }
  scored.sort((x, y) => y.w - x.w || x.from.localeCompare(y.from));
  const seen = new Set<string>();
  const out: GraphProposalEdge[] = [];
  for (const row of scored) {
    const key = `${row.from}|${row.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      from: row.from,
      to: row.to,
      type: row.type,
      source: row.source,
      confidence: row.confidence,
      weight: row.weight,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** 注入用：脚本接 getProvider().chat，单测用假函数，不绑密钥 */
export type ProposalLlmChat = (prompt: string) => Promise<string>;

const LLM_CONFIDENCE = 0.65;

function parseLlmAccepts(raw: string, n: number): boolean[] | null {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Array<{ i?: number; accept?: boolean }>;
    if (!Array.isArray(parsed) || parsed.length !== n) return null;
    return parsed.map(row => row.accept === true);
  } catch {
    return null;
  }
}

/**
 * 把规则提案交给模型复核。接受的改为 source=llm、置信度仍低于待考线；
 * 拒绝的从提案里拿掉（共现边仍在产物里）。解析失败则原样返回，不冒充 llm。
 */
export async function reviewProposalsWithLlm(
  proposals: GraphProposalEdge[],
  nodes: Array<{ id: string; label: string; type: string }>,
  chat: ProposalLlmChat,
): Promise<GraphProposalEdge[]> {
  if (proposals.length === 0) return proposals;
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const lines = proposals.map((p, i) => {
    const a = nodeById.get(p.from);
    const b = nodeById.get(p.to);
    return `${i + 1}. ${a?.label ?? p.from} → ${b?.label ?? p.to}`;
  });
  const prompt = [
    '你是道教文献助手。下列是从共现抽出的待审「相关」关系。',
    '只接受教义、科仪或丹法上确实相关的；仅因共用「天尊」「三」等字则拒绝。',
    '只输出 JSON 数组，长度必须与条目数相同，元素形如 {"i":1,"accept":true}。不要解释。',
    '',
    ...lines,
  ].join('\n');

  const raw = await chat(prompt);
  const accepts = parseLlmAccepts(raw, proposals.length);
  if (!accepts) return proposals;
  const kept: GraphProposalEdge[] = [];
  for (let i = 0; i < proposals.length; i++) {
    if (!accepts[i]) continue;
    kept.push({ ...proposals[i], source: 'llm', confidence: LLM_CONFIDENCE });
  }
  return kept;
}
