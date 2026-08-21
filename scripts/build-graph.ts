/**
 * 知识图谱构建脚本 —— 全库跑批，产出 public/data/graph.json。
 *
 * 运行：npm run build-graph  [-- --limit=50]（--limit 仅用于本地快速验证）
 *
 * 为什么在构建期算而不是运行时算：
 * 1. 提及扫描要读完 1504 部约 3500 万字，运行时绝无可能；
 * 2. 产物是纯静态 JSON，可随 public/data 一起提交与分发，
 *    生产环境无持久盘（见 docs/PRD-v2.1-GAP-STATUS.md），不能依赖运行时数据库；
 * 3. 图谱可复现：同一份词表 + 同一份原文 → 同一份图谱，便于回归对比。
 *
 * 内容边界（硬约束）：本脚本对 public/data/content 只读，绝不写回原文；
 * 每条边都带 source 与 confidence，提及边带可点回原文的 blockId 出处。
 *
 * 为什么产物是「一个文件」而不是每节点一个文件：按下面的截断策略，
 * 全图规模与 index.json 同量级，运行时按模块级缓存读一次即可；
 * 而 public/data 已有 1500+ 文件，再加数千个碎文件只会拖慢 git 与部署。
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseText } from '../lib/text-parser';
import { AhoCorasick } from '../lib/graph/matcher';
import {
  AutoTermsFile,
  GazetteerEntry,
  GraphEdge,
  GraphNode,
  GraphNodeType,
  GRAPH_VERSION,
  KnowledgeGraph,
  nodeId,
} from '../lib/graph/schema';
import { getEntryTags } from '../lib/entry-tags';
import type { DaozangEntry } from '../lib/data';

const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'public/data/index.json');
const CONTENT_DIR = path.join(ROOT, 'public/data/content');
const GAZETTEER_PATH = path.join(ROOT, 'data/graph/gazetteer.json');
const AUTO_TERMS_PATH = path.join(ROOT, 'data/graph/terms.auto.json');
const RITUAL_ILLUS_PATH = path.join(ROOT, 'data/ritual-illustrations.json');
const OUT_PATH = path.join(ROOT, 'public/data/graph.json');

// ---------- 截断参数：决定产物大小与「图不倾倒」的体验 ----------

/** 每个实体最多保留多少条「见于典籍」边（其余只计入总数） */
const MAX_MENTIONS_PER_ENTITY = 60;
/** 自动抽取实体的提及边更狠地截断：它们数量大，样本够用即可 */
const MAX_MENTIONS_PER_AUTO_ENTITY = 20;
/** 并入图谱的自动术语上限：控制产物体积与画面噪声 */
const MAX_AUTO_TERMS = 800;
/** 每条提及边保留的出处样本数 */
const MAX_CITATIONS_PER_EDGE = 2;
/** 出处引文截断长度：只为定位与预览，不做原文再分发 */
const QUOTE_LEN = 40;
/** 每个实体最多保留多少条共现边 */
const MAX_COOCCUR_PER_ENTITY = 8;
/** 每部典籍最多保留多少条关联文献边 */
const MAX_SIMILAR_PER_WORK = 8;
/**
 * 计算文献相关度时忽略「太常见」的实体：出现在超过此比例典籍中的概念
 * （如「道」「長生」）几乎不携带区分度，若不剔除会把所有书连成一团。
 */
const COMMON_ENTITY_DF_RATIO = 0.1;

interface IndexFile {
  entries: DaozangEntry[];
}

interface GazetteerFile {
  version: number;
  entries: GazetteerEntry[];
}

interface RitualIllusEntry {
  image: string;
  caption: string;
  position?: string;
  aiGenerated?: boolean;
}

interface MentionCitation {
  blockId: string;
  quote: string;
  matchedTerm: string;
}

/**
 * 提及统计：实体 → 典籍 → 命中详情。
 * 出处样本分两栏收集：整理者按语（經名／底本出處）虽含关键词，但不是经文原文，
 * 只在没有正文样本时才拿来兜底 —— 若混在一个数组里按后置排序，
 * 开篇提要会把额定名额先占满，正文样本永远进不来。
 */
interface MentionStat {
  count: number;
  titleHit: boolean;
  citations: MentionCitation[];
  editorNoteCitations: MentionCitation[];
}

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
}

/**
 * 清洗 index.json 的 author 字段。
 * 文件名解析器产出的形态常见为「宋-宋-王慶升」（朝代重复），
 * 这里取末段为人名、首段为朝代；明显异常的丢弃而不是硬塞进图谱。
 */
function parseAuthor(raw?: string): { name: string; era?: string } | null {
  if (!raw) return null;
  const parts = raw.split('-').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const name = parts[parts.length - 1];
  if (!name || name.length > 8 || /[0-9A-Za-z]/.test(name)) return null;
  const era = parts.length > 1 ? parts[0] : undefined;
  return { name, era };
}

function main(): void {
  const started = Date.now();
  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

  const index = readJson<IndexFile>(INDEX_PATH);
  const gazetteer = readJson<GazetteerFile>(GAZETTEER_PATH);
  const entries = Number.isFinite(limit) ? index.entries.slice(0, limit) : index.entries;

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const aliasIndex: Record<string, string> = {};

  const addNode = (node: GraphNode): GraphNode => {
    const existing = nodes.get(node.id);
    if (existing) return existing;
    nodes.set(node.id, node);
    return node;
  };

  /** 别名登记：先到先得，避免同一词形被两个实体争抢导致解析结果漂移 */
  const addAlias = (alias: string, id: string): void => {
    const key = alias.trim();
    if (!key) return;
    if (aliasIndex[key] && aliasIndex[key] !== id) return;
    aliasIndex[key] = id;
  };

  // ---------- 1. 词表实体 ----------

  /** 词表短 id → 节点 id，供种子边解析 */
  const gazNodeId = new Map<string, string>();
  for (const g of gazetteer.entries) {
    const id = nodeId(g.type, g.id);
    gazNodeId.set(g.id, id);
    addNode({
      id,
      type: g.type,
      label: g.label,
      aliases: g.aliases,
      shortDef: g.shortDef,
      origin: 'curated',
    });
    addAlias(g.label, id);
    for (const a of g.aliases) addAlias(a, id);
  }

  for (const g of gazetteer.entries) {
    for (const seed of g.seedEdges ?? []) {
      const from = gazNodeId.get(g.id);
      const to = gazNodeId.get(seed.to) ?? (nodes.has(seed.to) ? seed.to : undefined);
      if (!from || !to) {
        console.warn(`[warn] 种子边指向未知实体：${g.id} -> ${seed.to}`);
        continue;
      }
      edges.push({ from, to, type: seed.type, source: 'gazetteer', confidence: 0.9 });
    }
  }

  // ---------- 2. 目录轴：典籍 / 部 / 类 / 人物 / 标签 ----------

  const personNodeByName = new Map<string, string>();
  // 词表人物优先复用：著者「張伯端」应与词表实体「張伯端」是同一个节点，
  // 这样「书的著者」与「书中提及此人」两类边汇聚到同一处。
  for (const g of gazetteer.entries) {
    if (g.type !== 'person') continue;
    const id = gazNodeId.get(g.id)!;
    personNodeByName.set(g.label, id);
    for (const a of g.aliases) personNodeByName.set(a, id);
  }

  for (const e of entries) {
    const workId = nodeId('work', e.id);
    addNode({
      id: workId,
      type: 'work',
      label: e.title,
      meta: {
        category: e.category,
        subcategory: e.subcategory,
        author: e.author,
        lineCount: e.lineCount,
      },
    });
    addAlias(e.title, workId);

    // 部类：续道藏在 index 中 category 可能为空串，统一归到「续道藏」节点
    const categoryName = e.category || (e.collection.includes('续') ? '续道藏' : '未分类');
    const catId = nodeId('category', categoryName);
    addNode({ id: catId, type: 'category', label: categoryName });
    addAlias(categoryName, catId);

    if (e.subcategory) {
      const subId = nodeId('subcategory', e.subcategory);
      addNode({ id: subId, type: 'subcategory', label: e.subcategory });
      addAlias(e.subcategory, subId);
      edges.push({ from: workId, to: subId, type: 'part_of', source: 'catalog', confidence: 0.98 });
      edges.push({ from: subId, to: catId, type: 'part_of', source: 'catalog', confidence: 0.98 });
    } else {
      edges.push({ from: workId, to: catId, type: 'part_of', source: 'catalog', confidence: 0.98 });
    }

    const author = parseAuthor(e.author);
    if (author) {
      const personId = personNodeByName.get(author.name) ?? nodeId('person', author.name);
      if (!nodes.has(personId)) {
        addNode({
          id: personId,
          type: 'person',
          label: author.name,
          shortDef: author.era ? `${author.era}代人物（据文件名题署，未经考订）` : undefined,
        });
        addAlias(author.name, personId);
      }
      personNodeByName.set(author.name, personId);
      // 题署来自文件名解析，未经考订，置信度低于目录结构本身
      edges.push({ from: workId, to: personId, type: 'authored_by', source: 'catalog', confidence: 0.8 });
    }

    for (const tag of getEntryTags(e)) {
      const tagId = nodeId('tag', tag);
      addNode({ id: tagId, type: 'tag', label: tag });
      addAlias(tag, tagId);
      // 标签由标题正则推导（lib/entry-tags.ts），是启发式而非目录事实
      edges.push({ from: workId, to: tagId, type: 'has_tag', source: 'catalog', confidence: 0.75 });
    }
  }

  // ---------- 2b. 自动抽取术语（与策展词表合并，已有实体不重复建节点） ----------
  //
  // 词表有两个来源：人工策展覆盖核心语义域，自动抽取从 3500 万字里长出其余术语。
  // 自动术语不得编造 shortDef，只用 label 参与扫描；提及边截断更狠以控制体积。
  const autoEntityIds = new Set<string>();
  let autoMerged = 0;
  if (fs.existsSync(AUTO_TERMS_PATH)) {
    const autoFile = readJson<AutoTermsFile>(AUTO_TERMS_PATH);
    const unused = autoFile.terms.filter(t => !aliasIndex[t.term]);
    const byType = new Map<string, typeof unused>();
    for (const t of unused) {
      const list = byType.get(t.type) ?? [];
      list.push(t);
      byType.set(t.type, list);
    }
    for (const list of byType.values()) {
      list.sort((a, b) => b.score - a.score || b.docFreq - a.docFreq);
    }
    // 山川构词会捞出大量「某山」，按类型封顶，以免占尽自动名额
    const typeCap: Record<string, number> = {
      place: 50,
      person: 80,
      deity: 120,
      ritual: 40,
      sect: 30,
    };
    const picked: typeof unused = [];
    for (const [type, cap] of Object.entries(typeCap)) {
      picked.push(...(byType.get(type) ?? []).slice(0, cap));
    }
    const rest = Math.max(0, MAX_AUTO_TERMS - picked.length);
    picked.push(...(byType.get('concept') ?? []).slice(0, rest));
    for (const t of picked) {
      if (aliasIndex[t.term]) continue;
      const id = nodeId(t.type, `auto-${t.term}`);
      if (nodes.has(id)) continue;
      addNode({
        id,
        type: t.type,
        label: t.term,
        origin: 'auto',
        // 故意不写 shortDef：自动抽取只有统计证据，释义由策展词表承担
      });
      addAlias(t.term, id);
      autoEntityIds.add(id);
      autoMerged++;
    }
    console.log(
      `自动术语 ${autoFile.terms.length} 条 → 去重后 ${unused.length} → 并入 ${autoMerged}（上限 ${MAX_AUTO_TERMS}）`,
    );
  } else {
    console.log('未找到 data/graph/terms.auto.json，图谱仅含策展词表（可运行 npm run extract-terms）');
  }

  // ---------- 3. 全库提及扫描 ----------

  /** 模式表：patternIndex → 实体节点 id */
  const patterns: string[] = [];
  const patternOwner: string[] = [];
  for (const node of nodes.values()) {
    if (node.origin !== 'curated' && node.origin !== 'auto') continue;
    const forms = new Set<string>([node.label, ...(node.aliases ?? [])]);
    for (const f of forms) {
      // 单字模式在文言语料里噪声极大（「道」「符」），一律不参与扫描
      if (f.length < 2) continue;
      patterns.push(f);
      patternOwner.push(node.id);
    }
  }
  const automaton = new AhoCorasick(patterns);
  console.log(
    `扫描实体 ${gazetteer.entries.length} 策展 + ${autoMerged} 自动，模式 ${patterns.length} 个`,
  );

  /** 实体 → (典籍 id → 提及统计) */
  const mentions = new Map<string, Map<string, MentionStat>>();
  /** 典籍 → 命中实体集合（供共现与相关度计算） */
  const workEntities = new Map<string, Map<string, number>>();

  let scannedChars = 0;
  let scannedBooks = 0;

  for (const e of entries) {
    const contentPath = path.join(CONTENT_DIR, `${e.id}.json`);
    if (!fs.existsSync(contentPath)) continue;
    const { content } = readJson<{ content: string }>(contentPath);
    if (!content) continue;

    const parsed = parseText(content, e.id, e.title);
    scannedChars += content.length;
    scannedBooks++;

    const perWork = new Map<string, number>();

    for (const block of parsed.blocks) {
      if (block.type === 'separator' || !block.content) continue;
      const hits = automaton.scan(block.content);
      if (hits.length === 0) continue;

      // 同一块内同实体只取一条出处样本，但次数累计
      const seenInBlock = new Set<string>();
      for (const hit of hits) {
        const entityId = patternOwner[hit.patternIndex];
        let byWork = mentions.get(entityId);
        if (!byWork) {
          byWork = new Map();
          mentions.set(entityId, byWork);
        }
        let stat = byWork.get(e.id);
        if (!stat) {
          stat = { count: 0, titleHit: false, citations: [], editorNoteCitations: [] };
          byWork.set(e.id, stat);
        }
        stat.count++;
        perWork.set(entityId, (perWork.get(entityId) ?? 0) + 1);

        const bucket = block.type === 'editor-note' ? stat.editorNoteCitations : stat.citations;
        if (!seenInBlock.has(entityId) && bucket.length < MAX_CITATIONS_PER_EDGE) {
          seenInBlock.add(entityId);
          const from = Math.max(0, hit.start - 12);
          bucket.push({
            blockId: block.id,
            quote: block.content.slice(from, from + QUOTE_LEN).replace(/[\s\u3000]+/g, ' ').trim(),
            matchedTerm: block.content.slice(hit.start, hit.end),
          });
        }
      }
    }

    // 标题命中单独判定：书名含该实体是强信号，排序时优先
    for (const [entityId, byWork] of mentions) {
      const stat = byWork.get(e.id);
      if (!stat) continue;
      const node = nodes.get(entityId);
      if (!node) continue;
      const forms = [node.label, ...(node.aliases ?? [])];
      if (forms.some(f => f.length > 1 && e.title.includes(f))) stat.titleHit = true;
    }

    if (perWork.size > 0) workEntities.set(e.id, perWork);

    if (scannedBooks % 200 === 0) {
      console.log(`  已扫描 ${scannedBooks}/${entries.length} 部，${(scannedChars / 1e6).toFixed(1)}M 字`);
    }
  }

  // ---------- 4. 提及边（按权重截断） ----------

  for (const [entityId, byWork] of mentions) {
    const ranked = Array.from(byWork.entries())
      .map(([bookId, stat]) => ({ bookId, stat }))
      .sort((a, b) => {
        if (a.stat.titleHit !== b.stat.titleHit) return a.stat.titleHit ? -1 : 1;
        return b.stat.count - a.stat.count;
      });

    const node = nodes.get(entityId);
    if (node) node.works = ranked.length;

    const cap = autoEntityIds.has(entityId) ? MAX_MENTIONS_PER_AUTO_ENTITY : MAX_MENTIONS_PER_ENTITY;
    for (const { bookId, stat } of ranked.slice(0, cap)) {
      const entry = entries.find(x => x.id === bookId);
      if (!entry) continue;
      // 命中次数越多越可能是实质论述而非偶然用字；标题命中直接给高置信度
      const confidence = stat.titleHit ? 0.95 : Math.min(0.92, 0.72 + stat.count * 0.02);
      const citations = [...stat.citations, ...stat.editorNoteCitations]
        .slice(0, MAX_CITATIONS_PER_EDGE)
        .map(c => ({
          bookId,
          bookTitle: entry.title,
          blockId: c.blockId,
          quote: c.quote,
          matchedTerm: c.matchedTerm,
        }));

      edges.push({
        from: entityId,
        to: nodeId('work', bookId),
        type: 'mentioned_in',
        source: 'mention',
        confidence,
        weight: stat.count,
        citations,
      });
    }
  }

  // ---------- 5. 概念共现（弱关系） ----------

  const pairCount = new Map<string, number>();
  for (const perWork of workEntities.values()) {
    const ids = Array.from(perWork.keys()).sort();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}\u0000${ids[j]}`;
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }
  }

  /**
   * 实体各自出现的典籍数，用于把「共现次数」归一为「关联强度」。
   *
   * 为什么不能直接用共现次数排序：那衡量的是流行度而非关联度 ——
   * 「無為」「長生」几乎见于所有典籍，与任何概念的共现次数都最高，
   * 结果每个概念的邻居都是同一批泛词。改用 Jaccard（交/并）后，
   * 「符籙—授籙」这类真正同域的搭配才会排到前面。
   * 展示仍用可读的共现典籍数（weight），排序用 Jaccard。
   */
  const entityWorkCount = new Map<string, number>();
  for (const perWork of workEntities.values()) {
    for (const id of perWork.keys()) entityWorkCount.set(id, (entityWorkCount.get(id) ?? 0) + 1);
  }

  const cooccurByEntity = new Map<string, Array<{ other: string; weight: number; jaccard: number }>>();
  for (const [key, weight] of pairCount) {
    if (weight < 3) continue; // 共现少于 3 部视为偶然
    const [a, b] = key.split('\u0000');
    const union = (entityWorkCount.get(a) ?? 0) + (entityWorkCount.get(b) ?? 0) - weight;
    const jaccard = union > 0 ? weight / union : 0;
    if (jaccard < 0.08) continue;
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const list = cooccurByEntity.get(x) ?? [];
      list.push({ other: y, weight, jaccard });
      cooccurByEntity.set(x, list);
    }
  }

  const cooccurEmitted = new Set<string>();
  for (const [entityId, list] of cooccurByEntity) {
    list.sort((a, b) => b.jaccard - a.jaccard);
    for (const { other, weight, jaccard } of list.slice(0, MAX_COOCCUR_PER_ENTITY)) {
      const key = entityId < other ? `${entityId}\u0000${other}` : `${other}\u0000${entityId}`;
      if (cooccurEmitted.has(key)) continue;
      cooccurEmitted.add(key);
      edges.push({
        from: entityId,
        to: other,
        type: 'cooccurs_with',
        source: 'cooccur',
        // 共现只说明「常同时出现」，不构成义理上的关联断言，故置信度低
        confidence: Math.min(0.68, 0.35 + jaccard * 0.5),
        weight,
      });
    }
  }

  // ---------- 6. 文献相关度（共享概念 · IDF 加权） ----------

  const totalWorks = workEntities.size || 1;
  const df = new Map<string, number>();
  for (const perWork of workEntities.values()) {
    for (const id of perWork.keys()) df.set(id, (df.get(id) ?? 0) + 1);
  }

  /** 通用概念不参与相关度：否则「都提到了道」会把全库连成一团 */
  const commonThreshold = Math.max(20, Math.floor(totalWorks * COMMON_ENTITY_DF_RATIO));
  const idf = new Map<string, number>();
  const invertedIndex = new Map<string, string[]>();
  for (const [entityId, dfv] of df) {
    if (dfv < 2 || dfv > commonThreshold) continue;
    idf.set(entityId, Math.log(totalWorks / dfv));
  }
  for (const [bookId, perWork] of workEntities) {
    for (const entityId of perWork.keys()) {
      if (!idf.has(entityId)) continue;
      const list = invertedIndex.get(entityId) ?? [];
      list.push(bookId);
      invertedIndex.set(entityId, list);
    }
  }

  /** 归一化用的向量模长（tf 取对数抑制长篇优势） */
  const norm = new Map<string, number>();
  for (const [bookId, perWork] of workEntities) {
    let sum = 0;
    for (const [entityId, tf] of perWork) {
      const w = idf.get(entityId);
      if (w === undefined) continue;
      const v = (1 + Math.log(tf)) * w;
      sum += v * v;
    }
    norm.set(bookId, Math.sqrt(sum) || 1);
  }

  for (const [bookId, perWork] of workEntities) {
    const scores = new Map<string, number>();
    for (const [entityId, tf] of perWork) {
      const w = idf.get(entityId);
      if (w === undefined) continue;
      const vSelf = (1 + Math.log(tf)) * w;
      for (const otherId of invertedIndex.get(entityId) ?? []) {
        if (otherId === bookId) continue;
        const otherTf = workEntities.get(otherId)?.get(entityId) ?? 0;
        if (otherTf === 0) continue;
        const vOther = (1 + Math.log(otherTf)) * w;
        scores.set(otherId, (scores.get(otherId) ?? 0) + vSelf * vOther);
      }
    }

    const ranked = Array.from(scores.entries())
      .map(([otherId, dot]) => ({
        otherId,
        sim: dot / (norm.get(bookId)! * norm.get(otherId)!),
      }))
      .filter(r => r.sim > 0.12)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, MAX_SIMILAR_PER_WORK);

    for (const { otherId, sim } of ranked) {
      edges.push({
        from: nodeId('work', bookId),
        to: nodeId('work', otherId),
        type: 'similar_work',
        source: 'similar',
        // 相关度是计算得到的建议，不是文献学结论
        confidence: Math.min(0.85, 0.5 + sim * 0.4),
        weight: Math.round(sim * 1000) / 1000,
      });
    }
  }

  // ---------- 7. 已审核图像资产 ----------

  if (fs.existsSync(RITUAL_ILLUS_PATH)) {
    const manifest = readJson<Record<string, Record<string, RitualIllusEntry>>>(RITUAL_ILLUS_PATH);
    let imgSeq = 0;
    for (const [bookId, anchors] of Object.entries(manifest)) {
      const workNode = nodes.get(nodeId('work', bookId));
      if (!workNode) continue;
      for (const [anchor, illus] of Object.entries(anchors)) {
        const imgId = nodeId('image', `ritual-${bookId}-${imgSeq++}`);
        addNode({
          id: imgId,
          type: 'image',
          label: illus.caption.slice(0, 24),
          // AI 生成图像必须显式标注，绝不伪装为史料图版
          meta: { imageUrl: illus.image, aiGenerated: illus.aiGenerated ?? false },
        });
        edges.push({
          from: imgId,
          to: workNode.id,
          type: 'illustrates',
          source: 'human',
          confidence: illus.aiGenerated ? 0.6 : 0.9,
          citations: [{ bookId, bookTitle: workNode.label, blockId: anchor }],
        });
        // 图注里能对上词表的实体建立「所绘」边
        for (const hit of automaton.scan(illus.caption)) {
          edges.push({
            from: imgId,
            to: patternOwner[hit.patternIndex],
            type: 'depicts',
            source: 'mention',
            confidence: 0.6,
          });
        }
      }
    }
  }

  // ---------- 8. 输出 ----------

  const graph: KnowledgeGraph = {
    version: GRAPH_VERSION,
    buildTime: new Date().toISOString(),
    stats: {
      nodes: nodes.size,
      edges: edges.length,
      works: entries.length,
      entities: gazetteer.entries.length + autoMerged,
      autoEntities: autoMerged,
      scannedChars,
      buildMs: Date.now() - started,
    },
    nodes: Array.from(nodes.values()),
    edges,
    aliasIndex,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(graph), 'utf-8');

  const sizeMb = fs.statSync(OUT_PATH).size / 1024 / 1024;
  const byType = new Map<GraphNodeType, number>();
  for (const n of nodes.values()) byType.set(n.type, (byType.get(n.type) ?? 0) + 1);
  const byEdge = new Map<string, number>();
  for (const e of edges) byEdge.set(e.type, (byEdge.get(e.type) ?? 0) + 1);

  console.log(`\n图谱已写入 ${path.relative(ROOT, OUT_PATH)}（${sizeMb.toFixed(2)}MB）`);
  console.log(`节点 ${nodes.size}：${Array.from(byType).map(([t, n]) => `${t} ${n}`).join(' / ')}`);
  console.log(`边 ${edges.length}：${Array.from(byEdge).map(([t, n]) => `${t} ${n}`).join(' / ')}`);
  console.log(`扫描 ${scannedBooks} 部 / ${(scannedChars / 1e6).toFixed(1)}M 字，耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main();
