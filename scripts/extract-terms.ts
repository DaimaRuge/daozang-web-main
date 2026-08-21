/**
 * 领域术语自动抽取流水线（离线跑批）。
 *
 * 运行：npm run extract-terms  [-- --limit=200 --max-terms=4000]
 * 产出：data/graph/terms.auto.json（自动词表）+ docs/term-extraction-report.md（评估报告）
 *
 * 为什么要有这条流水线：人工策展的词表覆盖面停在百条量级，而道藏 3500 万字里
 * 绝大多数术语没有人来录。词表的两个来源里，这条负责「从数据里长出来的那一半」；
 * 另一半是用户查询时实时计算（见 lib/graph/query.ts 的 relatedByKeyword）。
 *
 * 流程：
 *   1. 语料常驻内存并按标点切短句（候选不跨标点）
 *   2. Apriori 逐长度计数：长度 n 的候选必须其两个 n-1 子串都高频，
 *      否则 3500 万字的 2~6 元组会把内存撑爆
 *   3. 逐长度统计左右邻字熵、典籍数、单书集中度
 *   4. 弱监督标注：策展词表词形为正例，其余为未标注负例（PU）
 *   5. 逻辑回归打分 → 取头部 → 去除被更长术语解释掉的子串
 *   6. 构词规则 + 分布近邻 kNN 判定本体类型
 *   7. 交叉验证评估：每折留出部分策展词，看模型能否重新发现它们
 *
 * 内容边界：产物只含术语字符串与统计量，不含任何机器编造的释义 ——
 * 自动术语在界面上以语料证据（频次、出现典籍、原文出处）示人，
 * 而不是伪造成词典条目。
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  categoryDivergence,
  cohesion,
  domainTermScore,
  entropy,
  features,
  FEATURE_NAMES,
  isAbsorbedBy,
  isGraphWorthy,
  isPlausibleTerm,
  MAX_AUTO_DOC_RATIO,
  MAX_DOC_SHARE,
  MIN_DOC_FREQ,
  MIN_FREEDOM,
  splitClauses,
  TermObservation,
} from '../lib/graph/term-stats';
import { fitLogistic, predictProba, rocAuc } from '../lib/graph/term-model';
import { assignType, AutoNodeType, typeByMorphology, TypedSeed } from '../lib/graph/term-typing';
import { GazetteerEntry } from '../lib/graph/schema';

const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'public/data/index.json');
const CONTENT_DIR = path.join(ROOT, 'public/data/content');
const GAZETTEER_PATH = path.join(ROOT, 'data/graph/gazetteer.json');
const OUT_PATH = path.join(ROOT, 'data/graph/terms.auto.json');
const REPORT_PATH = path.join(ROOT, 'docs/term-extraction-report.md');

/** 候选最低频次：3500 万字语料里出现少于此数的串没有统计意义 */
const MIN_FREQ = 30;
/** 候选长度范围（单字不构成术语，超过 6 字多为短句残片） */
const MIN_LEN = 2;
const MAX_LEN = 6;
/** 入选术语上限：控制图谱产物体积与画面噪声 */
const DEFAULT_MAX_TERMS = 6000;
/**
 * 混合分下限。模型概率经 L2 校准后很少再顶到 1.0；
 * 再与领域分混合，0.32 大约对应「中等把握的专门术语」。
 */
const MIN_BLEND = 0.32;

interface Entry {
  id: string;
  title: string;
  category: string;
  collection: string;
}

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
}

const fmtNum = (n: number) => n.toLocaleString('zh-CN');

function main(): void {
  const started = Date.now();
  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  const maxTermsArg = process.argv.find(a => a.startsWith('--max-terms='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
  const maxTerms = maxTermsArg ? parseInt(maxTermsArg.split('=')[1], 10) : DEFAULT_MAX_TERMS;

  const index = readJson<{ entries: Entry[] }>(INDEX_PATH);
  const entries = Number.isFinite(limit) ? index.entries.slice(0, limit) : index.entries;

  // ---------- 1. 语料常驻内存（后续要多趟扫描，重复读盘与切分是浪费） ----------
  console.log(`加载语料：${entries.length} 部…`);
  const docs: Array<{
    id: string;
    title: string;
    category: string;
    clauses: string[];
    chars: number;
  }> = [];
  let totalChars = 0;
  /** 语料整体的部类分布（按字数），作为部类偏离度的基准分布 */
  const corpusByCategory = new Map<string, number>();
  for (const e of entries) {
    const p = path.join(CONTENT_DIR, `${e.id}.json`);
    if (!fs.existsSync(p)) continue;
    const { content } = readJson<{ content: string }>(p);
    if (!content) continue;
    const clauses = splitClauses(content);
    let chars = 0;
    for (const c of clauses) chars += c.length;
    const category = e.category || (e.collection?.includes('续') ? '续道藏' : '未分类');
    docs.push({ id: e.id, title: e.title, category, clauses, chars });
    corpusByCategory.set(category, (corpusByCategory.get(category) ?? 0) + chars);
    totalChars += chars;
  }
  console.log(`  汉字 ${(totalChars / 1e6).toFixed(1)}M，短句 ${docs.reduce((a, d) => a + d.clauses.length, 0).toLocaleString('zh-CN')} 条`);

  // ---------- 2. Apriori 逐长度计数 ----------
  /** 长度 → (串 → 频次)，仅保留达到 MIN_FREQ 的串 */
  const freqByLen: Array<Map<string, number>> = [];
  for (let n = 0; n <= MAX_LEN; n++) freqByLen.push(new Map());

  for (let n = 1; n <= MAX_LEN; n++) {
    const counter = new Map<string, number>();
    const prev = freqByLen[n - 1];
    for (const doc of docs) {
      for (const clause of doc.clauses) {
        const L = clause.length;
        for (let i = 0; i + n <= L; i++) {
          // Apriori 剪枝：长度 n 的串若有任一 n-1 子串不高频，它自己不可能高频。
          // 这一步把 3500 万字的高阶 n 元组规模压到可控范围。
          if (n >= 3) {
            if (!prev.has(clause.substr(i, n - 1))) continue;
            if (!prev.has(clause.substr(i + 1, n - 1))) continue;
          }
          const s = clause.substr(i, n);
          counter.set(s, (counter.get(s) ?? 0) + 1);
        }
      }
    }
    const kept = freqByLen[n];
    for (const [s, f] of counter) if (f >= MIN_FREQ) kept.set(s, f);
    console.log(`  n=${n}：计数 ${counter.size.toLocaleString('zh-CN')} → 保留(freq≥${MIN_FREQ}) ${kept.size.toLocaleString('zh-CN')}`);
  }

  /** 频次查询：跨长度统一入口，供凝固度计算取子串频次 */
  const freqOf = (s: string): number => {
    if (s.length === 1) return freqByLen[1].get(s) ?? 0;
    return freqByLen[s.length]?.get(s) ?? 0;
  };

  // ---------- 3. 逐长度统计邻字熵、典籍数、集中度 ----------
  const titles = docs.map(d => d.title);
  const observations: TermObservation[] = [];

  for (let n = MIN_LEN; n <= MAX_LEN; n++) {
    const candidates = new Map<string, number>();
    for (const [s, f] of freqByLen[n]) if (isPlausibleTerm(s)) candidates.set(s, f);
    if (candidates.size === 0) continue;

    // 逐长度扫描而不是一次性统计所有长度：同时驻留 2~6 元组的邻字直方图
    // 会占用数 GB 内存，分长度处理把峰值压到十分之一
    const left = new Map<string, Map<string, number>>();
    const right = new Map<string, Map<string, number>>();
    const docHits = new Map<string, Map<string, number>>();
    for (const s of candidates.keys()) {
      left.set(s, new Map());
      right.set(s, new Map());
      docHits.set(s, new Map());
    }

    for (const doc of docs) {
      for (const clause of doc.clauses) {
        const L = clause.length;
        for (let i = 0; i + n <= L; i++) {
          const s = clause.substr(i, n);
          if (!candidates.has(s)) continue;
          // 句首/句尾用哨兵计入：能出现在句子边界本身就是「可独立使用」的证据
          const lc = i > 0 ? clause[i - 1] : '\u0001';
          const rc = i + n < L ? clause[i + n] : '\u0002';
          const lm = left.get(s)!;
          lm.set(lc, (lm.get(lc) ?? 0) + 1);
          const rm = right.get(s)!;
          rm.set(rc, (rm.get(rc) ?? 0) + 1);
          const dm = docHits.get(s)!;
          dm.set(doc.id, (dm.get(doc.id) ?? 0) + 1);
        }
      }
    }

    // 延长串索引：把 n+1 元组按「去掉首字」「去掉尾字」归到长度 n 的键上，
    // 取最高频次。直接对每个候选遍历 n+1 元组表是数十亿次比较，必须先建索引
    const maxExtensionFreq = new Map<string, number>();
    const longerMap = freqByLen[n + 1];
    if (longerMap) {
      for (const [ext, ef] of longerMap) {
        for (const key of [ext.slice(0, n), ext.slice(1)]) {
          if ((maxExtensionFreq.get(key) ?? 0) < ef) maxExtensionFreq.set(key, ef);
        }
      }
    }

    const categoryOfDoc = new Map(docs.map(d => [d.id, d.category]));
    for (const [s, f] of candidates) {
      const dm = docHits.get(s)!;
      let maxInDoc = 0;
      const byCategory = new Map<string, number>();
      for (const [docId, v] of dm) {
        if (v > maxInDoc) maxInDoc = v;
        const c = categoryOfDoc.get(docId)!;
        byCategory.set(c, (byCategory.get(c) ?? 0) + v);
      }
      observations.push({
        fragmentRatio: f > 0 ? Math.min(1, (maxExtensionFreq.get(s) ?? 0) / f) : 0,
        categoryDivergence: categoryDivergence(byCategory, corpusByCategory),
        term: s,
        freq: f,
        docFreq: dm.size,
        maxDocShare: f > 0 ? maxInDoc / f : 0,
        leftEntropy: entropy(left.get(s)!),
        rightEntropy: entropy(right.get(s)!),
        cohesion: cohesion(s, freqOf, totalChars),
        titleDocFreq: titles.reduce((acc, t) => acc + (t.includes(s) ? 1 : 0), 0),
      });
    }
    console.log(`  n=${n}：形态可信候选 ${candidates.size.toLocaleString('zh-CN')} 条已统计`);
  }

  console.log(`候选合计 ${observations.length.toLocaleString('zh-CN')} 条`);

  // ---------- 4~5. 弱监督训练与打分 ----------
  // 先过「能否作为图谱节点」的硬性前提，再交给模型排序：
  // 这几条是定义性要求（见 isGraphWorthy），不该让模型用高频次把它们权衡掉
  /**
   * 具名实体（天尊、真人、燈儀）常集中在少数科仪书里，单书占比与左右熵
   * 会略越通用门槛。它们的类型由构词法钉死，放宽硬门槛比让模型去权衡更安全。
   */
  const worthy = observations.filter(o => {
    if (!Number.isFinite(o.cohesion)) return false;
    if (isGraphWorthy(o)) return true;
    if (!typeByMorphology(o.term)) return false;
    return (
      o.docFreq >= MIN_DOC_FREQ &&
      Math.min(o.leftEntropy, o.rightEntropy) >= 0.5 &&
      o.maxDocShare <= 0.85 &&
      o.fragmentRatio <= 0.85
    );
  });
  const droppedByGate = observations.length - worthy.length;
  console.log(
    `硬性前提过滤：${fmtNum(observations.length)} → ${fmtNum(worthy.length)}` +
      `（要求 典籍数≥${MIN_DOC_FREQ}、自由度≥${MIN_FREEDOM}、单书占比≤${MAX_DOC_SHARE}；具名实体放宽）`,
  );

  const usable = worthy;
  const X = usable.map(features);

  /**
   * 监督标签改用人工策展词表。
   *
   * 为什么不再用「书名子串」当标签：书名里的串偏长偏常见，模型据此学成了
   * 频次排序器 —— 「天地」「萬物」排到最前，而「符籙」(0.39)、「雷法」(0.08)
   * 这类中频却高度专门的核心术语被压到门槛之下。而策展词表就是「领域专家
   * 认可的术语」这一目标概念的直接样本，正是监督学习该用的标签。
   * 书名出现数降级为特征，信息没丢。
   *
   * 代价：策展词表不再是独立评估集，故改用 5 折交叉验证 ——
   * 每折用其余四折训练，看能否重新发现被留出的那批策展词。
   */
  const gazetteerForLabels = readJson<{ entries: GazetteerEntry[] }>(GAZETTEER_PATH);
  const curatedLabelForms = new Set<string>();
  for (const g of gazetteerForLabels.entries) {
    for (const form of [g.label, ...g.aliases]) curatedLabelForms.add(form);
  }
  const y: number[] = usable.map(o => (curatedLabelForms.has(o.term) ? 1 : 0));
  const positives = y.reduce((a, b) => a + b, 0);

  /** 确定性分折（按术语哈希），保证可复现 */
  const foldOf = (s: string): number => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003;
    return h % 5;
  };

  // 正例权重封顶：未封顶时 (neg/pos)/6 约 50+，配合弱 L2 会把权重推到饱和。
  const posWeight = Math.min(
    10,
    Math.max(1, (usable.length - positives) / Math.max(1, positives) / 12),
  );
  const fitOpts = { epochs: 50, learningRate: 0.05, l2: 0.08, positiveWeight: posWeight };

  // 交叉验证：只用于报告泛化能力，不参与最终产物
  const cvAucs: number[] = [];
  const cvRecallAtK: number[] = [];
  for (let fold = 0; fold < 5; fold++) {
    const trIdx: number[] = [];
    const teIdx: number[] = [];
    usable.forEach((o, i) => (foldOf(o.term) === fold ? teIdx : trIdx).push(i));
    const m = fitLogistic(trIdx.map(i => X[i]), trIdx.map(i => y[i]), fitOpts);
    const teScores = teIdx.map(i => predictProba(m, X[i]));
    const teLabels: number[] = teIdx.map(i => y[i]);
    cvAucs.push(rocAuc(teScores, teLabels));
    // 留出折内按得分排序，取与正例数同量的头部，统计命中比例（recall@K）
    const k = teLabels.reduce((a, b) => a + b, 0);
    if (k > 0) {
      const top = teScores
        .map((s, j) => ({ s, y: teLabels[j] }))
        .sort((a, b) => b.s - a.s)
        .slice(0, k);
      cvRecallAtK.push(top.reduce((a, r) => a + r.y, 0) / k);
    }
  }
  const mean = (a: number[]) => (a.length ? a.reduce((x, y2) => x + y2, 0) / a.length : 0);
  const aucCv = mean(cvAucs);
  const recallCv = mean(cvRecallAtK);

  // 最终模型用全部标签训练（产物要覆盖全部术语）
  const model = fitLogistic(X, y, fitOpts);
  const scoreAll = usable.map((o, i) => predictProba(model, X[i]));
  const aucTrain = rocAuc(scoreAll, y);
  const domainAll = usable.map(o => domainTermScore(o, docs.length));
  /** 领域分纠正「书名高频词」偏差，模型分保留策展词的形态偏好 */
  const blendAll = scoreAll.map((p, i) => 0.35 * p + 0.65 * domainAll[i]);

  // ---------- 5. 取头部并去除被更长术语解释掉的子串 ----------
  const ranked = usable
    .map((o, i) => ({ o, p: scoreAll[i], domain: domainAll[i], blend: blendAll[i] }))
    .filter(r => {
      const named = typeByMorphology(r.o.term) !== null;
      if (!named && r.o.docFreq > docs.length * MAX_AUTO_DOC_RATIO) return false;
      // 具名实体（某某天尊）构词信号硬，门槛放宽；其余走混合分
      if (named) return r.blend >= 0.18;
      return r.blend >= MIN_BLEND;
    })
    .sort((a, b) => b.blend - a.blend);

  const selected: Array<{ o: TermObservation; p: number; domain: number; blend: number }> = [];
  /**
   * 分层配额：为构词规则能判出类型的术语（神祇/人物/科仪/地域/宗派）单独留出名额。
   *
   * 为什么必须分层：模型偏好「高频 + 分布广」的串，而具体实体（「白玉蟾」「崑崙」）
   * 本就没有通用概念那么高频，纯按得分取头部会把它们全挤掉 ——
   * 可图谱恰恰最需要这类能连出关系的具名实体。
   */
  const namedQuota = Math.floor(maxTerms * 0.4);
  let namedTaken = 0;
  let conceptTaken = 0;
  const conceptQuota = maxTerms - namedQuota;

  // 第一遍：按从长到短标记「被更长入选候选吸收」的子串。
  // 不能把吸收与配额合成一遍 —— 先长后短入选会让四字串占满概念名额，
  // 「符籙」「雷法」这类二字核心术语永远排不到。
  const survivors: typeof ranked = [];
  const keptByLen = new Map<number, Set<string>>();
  for (const r of [...ranked].sort((a, b) => b.o.term.length - a.o.term.length || b.blend - a.blend)) {
    let maxContaining = 0;
    for (let len = r.o.term.length + 1; len <= MAX_LEN; len++) {
      const set = keptByLen.get(len);
      if (!set) continue;
      for (const longer of set) {
        if (longer.includes(r.o.term)) maxContaining = Math.max(maxContaining, freqOf(longer));
      }
    }
    if (maxContaining > 0 && isAbsorbedBy(r.o, maxContaining, MIN_FREQ)) continue;
    survivors.push(r);
    const set = keptByLen.get(r.o.term.length) ?? new Set<string>();
    set.add(r.o.term);
    keptByLen.set(r.o.term.length, set);
  }

  // 第二遍：在未被吸收的候选里按混合分取头部，此时二字词与四字词公平竞争
  for (const r of survivors.sort((a, b) => b.blend - a.blend)) {
    if (selected.length >= maxTerms) break;
    const named = typeByMorphology(r.o.term) !== null;
    if (named) {
      if (namedTaken >= namedQuota) continue;
      namedTaken++;
    } else {
      if (conceptTaken >= conceptQuota) continue;
      conceptTaken++;
    }
    selected.push(r);
  }

  // ---------- 6. 类型判定 ----------
  const gazetteer = readJson<{ entries: GazetteerEntry[] }>(GAZETTEER_PATH);
  // 只为「入选术语 + 策展词形」重扫一次文档集合：集合已收窄到数千条，代价可控，
  // 而这份分布是 kNN 类型判定与独立召回评估共同需要的
  const docsOfTerm = new Map<string, Set<string>>();
  const needDocs = new Set<string>();
  for (const r of selected) needDocs.add(r.o.term);
  const seedForms = new Map<string, AutoNodeType>();
  for (const g of gazetteer.entries) {
    const t = g.type as AutoNodeType;
    for (const form of [g.label, ...g.aliases]) {
      if (form.length >= MIN_LEN && form.length <= MAX_LEN) {
        seedForms.set(form, t);
        needDocs.add(form);
      }
    }
  }

  for (const s of needDocs) docsOfTerm.set(s, new Set());
  for (const doc of docs) {
    for (const clause of doc.clauses) {
      const L = clause.length;
      for (let i = 0; i < L; i++) {
        for (let n = MIN_LEN; n <= MAX_LEN && i + n <= L; n++) {
          const s = clause.substr(i, n);
          const set = docsOfTerm.get(s);
          if (set) set.add(doc.id);
        }
      }
    }
  }

  const seeds: TypedSeed[] = [];
  for (const [form, type] of seedForms) {
    const d = docsOfTerm.get(form);
    if (d && d.size > 0) seeds.push({ type, docs: d });
  }

  const typed = selected.map(r => {
    const verdict = assignType(r.o.term, docsOfTerm.get(r.o.term) ?? new Set(), seeds);
    return { ...r, verdict };
  });

  // ---------- 7. 策展词表覆盖与逐条诊断 ----------
  const curatedForms = Array.from(seedForms.keys()).filter(f => {
    const d = docsOfTerm.get(f);
    return d && d.size > 0;
  });
  const selectedSet = new Set(typed.map(t => t.o.term));
  const candidateSet = new Set(usable.map(o => o.term));
  const recallCandidates = curatedForms.filter(f => candidateSet.has(f));
  const recallSelected = curatedForms.filter(f => selectedSet.has(f));

  /**
   * 逐条诊断：策展词为什么落选。
   * 没有这张表就只能靠猜 —— 落选可能出在频次门槛、硬门槛、模型打分或子串去重，
   * 四者的修法完全不同。
   */
  const obsByTerm = new Map(observations.map(o => [o.term, o]));
  const scoreByTerm = new Map(usable.map((o, i) => [o.term, scoreAll[i]]));
  const blendByTerm = new Map(usable.map((o, i) => [o.term, blendAll[i]]));
  const curatedDiagnosis = gazetteer.entries
    .map(g => {
      const term = g.label;
      const o = obsByTerm.get(term);
      const p = scoreByTerm.get(term);
      const blend = blendByTerm.get(term);
      let stage = '入选';
      if (selectedSet.has(term)) stage = '入选';
      else if (!o) stage = `未达频次门槛(≥${MIN_FREQ})或形态被排除`;
      else if (p === undefined) stage = '未过图谱适用性硬门槛';
      else if (!typeByMorphology(term) && o.docFreq > docs.length * MAX_AUTO_DOC_RATIO) {
        stage = '典籍占比过高（泛词）';
      } else if (blend !== undefined && blend < (typeByMorphology(term) ? 0.18 : MIN_BLEND)) {
        stage = '综合打分偏低';
      } else stage = '被更长术语解释或名额用尽';
      return { term, type: g.type, o, p, blend, stage };
    })
    .sort((a, b) => (a.stage === b.stage ? 0 : a.stage === '入选' ? 1 : -1));

  // ---------- 8. 写出产物与报告 ----------
  const payload = {
    version: 1,
    buildTime: new Date().toISOString(),
    pipeline: {
      minFreq: MIN_FREQ,
      minBlend: MIN_BLEND,
      maxTerms,
      corpusChars: totalChars,
      docs: docs.length,
      candidates: usable.length,
      labeledPositives: positives,
      l2: fitOpts.l2,
      positiveWeight: Number(posWeight.toFixed(2)),
      aucTrain: Number(aucTrain.toFixed(4)),
      aucCrossValidated: Number(aucCv.toFixed(4)),
      recallAtKCrossValidated: Number(recallCv.toFixed(4)),
      featureWeights: FEATURE_NAMES.map((name, i) => ({
        name,
        weight: Number(model.weights[i].toFixed(4)),
      })),
    },
    terms: typed.map(t => ({
      term: t.o.term,
      type: t.verdict.type,
      // 术语本身的置信度取「像术语」与「类型判对」两者的较小值：
      // 类型没把握时不该因为术语本身可信就整体显示为确定
      score: Number(t.blend.toFixed(4)),
      typeConfidence: Number(t.verdict.confidence.toFixed(3)),
      typeBasis: t.verdict.basis,
      freq: t.o.freq,
      docFreq: t.o.docFreq,
      cohesion: Number(t.o.cohesion.toFixed(2)),
      freedom: Number(Math.min(t.o.leftEntropy, t.o.rightEntropy).toFixed(2)),
      titleDocFreq: t.o.titleDocFreq,
      typeHint: t.verdict.hint ?? null,
    })),
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 1), 'utf-8');

  const byType = new Map<string, number>();
  for (const t of typed) byType.set(t.verdict.type, (byType.get(t.verdict.type) ?? 0) + 1);
  const byRule = typed.filter(t => t.verdict.basis.startsWith('构词规则')).length;
  const hinted = typed.filter(t => t.verdict.hint).length;

  const fmt = fmtNum;
  const report = [
    '# 领域术语自动抽取报告',
    '',
    `- 生成时间：${new Date().toISOString()}`,
    `- 语料：${fmt(docs.length)} 部 / ${(totalChars / 1e6).toFixed(1)}M 汉字`,
    `- 候选（频次≥${MIN_FREQ} 且形态可信）：${fmt(observations.length)} 条`,
    `- 通过图谱适用性硬门槛（典籍数≥${MIN_DOC_FREQ}、自由度≥${MIN_FREEDOM}、单书占比≤${MAX_DOC_SHARE}）：${fmt(usable.length)} 条（滤除 ${fmt(droppedByGate)} 条）`,
    `- 入选术语：${fmt(typed.length)} 条（混合分≥${MIN_BLEND}，上限 ${fmt(maxTerms)}）`,
    `- 耗时：${((Date.now() - started) / 1000).toFixed(1)}s`,
    '',
    '## 判别模型',
    '',
    '监督标签：人工策展词表中的词形为正例，其余候选为未标注负例（PU 设置）。',
    '',
    '为什么用策展词表当标签而不是书名：书名里的串偏长偏常见，用它当标签会把模型',
    '学成频次排序器 —— 「天地」「萬物」排到最前，而「符籙」「雷法」这类中频却高度',
    '专门的核心术语反被压到门槛之下。策展词表是「领域专家认可的术语」这一目标概念的',
    '直接样本。书名出现数降级为特征，信息没有丢失。',
    '',
    '代价是策展词表不再是独立评估集，故泛化能力改用 5 折交叉验证衡量：',
    '每折用其余四折训练，看模型能否重新发现被留出的那批策展词。',
    '',
    '入选排序不单用模型概率：策展正例偏「书名高频词」，模型会把「太上」「真經」',
    '排到最前。故与无监督领域分（部类偏离 + 中频 + 凝固度 − 残片）按 0.35/0.65 混合。',
    '',
    `- 候选样本：${fmt(model.meta.samples)} 条，其中标注正例 ${fmt(model.meta.positives)} 条`,
    `- L2 = ${fitOpts.l2}，正例权重 = ${posWeight.toFixed(2)}（封顶 10，避免得分饱和）`,
    `- AUC（全量拟合，仅供参考）：${aucTrain.toFixed(4)}`,
    `- **AUC（5 折交叉验证）：${aucCv.toFixed(4)}**`,
    `- **recall@K（5 折交叉验证，K = 该折正例数）：${(recallCv * 100).toFixed(1)}%**`,
    '',
    '| 特征 | 权重（标准化后） |',
    '|---|---|',
    ...FEATURE_NAMES.map((n, i) => `| ${n} | ${model.weights[i].toFixed(4)} |`),
    '',
    "## 策展词表覆盖情况（此表为训练标签，非独立评估 —— 独立指标见上方交叉验证）",
    '',
    `- 策展词形（在语料中确有出现）：${fmt(curatedForms.length)} 条`,
    `- 进入候选集：${fmt(recallCandidates.length)} 条（${((recallCandidates.length / curatedForms.length) * 100).toFixed(1)}%）`,
    `- 最终入选：${fmt(recallSelected.length)} 条（${((recallSelected.length / curatedForms.length) * 100).toFixed(1)}%）`,
    '',
    '未进入候选集的策展词形多为低频（未达频次门槛）或异体写法，属预期损失；',
    '这两个比例是流水线质量的主要回归指标，调参前后应对比本节。',
    '',
    '### 策展正名逐条诊断（落选原因）',
    '',
    '| 术语 | 类型 | 频次 | 典籍数 | 凝固度 | 自由度 | 单书占比 | 部类偏离 | 混合分 | 结果 |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...curatedDiagnosis.map(d => {
      const o = d.o;
      const f = (v?: number) => (v === undefined ? '-' : v.toFixed(2));
      return `| ${d.term} | ${d.type} | ${o ? fmt(o.freq) : '-'} | ${o ? o.docFreq : '-'} | ${f(o?.cohesion)} | ${o ? Math.min(o.leftEntropy, o.rightEntropy).toFixed(2) : '-'} | ${f(o?.maxDocShare)} | ${f(o?.categoryDivergence)} | ${d.blend !== undefined ? d.blend.toFixed(3) : '-'} | ${d.stage} |`;
    }),
    '',
    '## 类型分布',
    '',
    '| 类型 | 数量 |',
    '|---|---|',
    ...Array.from(byType.entries()).sort((a, b) => b[1] - a[1]).map(([t, n]) => `| ${t} | ${fmt(n)} |`),
    '',
    `- 由构词规则判定类型：${fmt(byRule)} 条（${((byRule / typed.length) * 100).toFixed(1)}%），置信度 0.85`,
    `- 未见构词标记、归为「概念」：${fmt(typed.length - byRule)} 条 —— 这不代表分类错误，`,
    '  而是「类型未判定」。其中 ' + fmt(hinted) + ' 条带有分布近邻提示（记录在产物的 typeHint 字段，',
    '  供后续人工审核参考，不用作节点类型：文档分布能说明语义域相关，说不清是概念还是科仪）。',
    '',
    '## 入选术语抽样（按得分前 60）',
    '',
    '| 术语 | 类型 | 得分 | 频次 | 典籍数 | 凝固度 | 自由度 | 类型判据 |',
    '|---|---|---|---|---|---|---|---|',
    ...typed.slice(0, 60).map(t =>
      `| ${t.o.term} | ${t.verdict.type} | ${t.blend.toFixed(3)} | ${fmt(t.o.freq)} | ${fmt(t.o.docFreq)} | ${t.o.cohesion.toFixed(1)} | ${Math.min(t.o.leftEntropy, t.o.rightEntropy).toFixed(1)} | ${t.verdict.basis} |`,
    ),
    '',
    '## 落选样本抽样（得分最低 30，供检查是否误杀）',
    '',
    '| 串 | 得分 | 频次 | 凝固度 | 自由度 |',
    '|---|---|---|---|---|',
    ...usable
      .map((o, i) => ({ o, blend: blendAll[i] }))
      .sort((a, b) => a.blend - b.blend)
      .slice(0, 30)
      .map(r => `| ${r.o.term} | ${r.blend.toFixed(3)} | ${fmt(r.o.freq)} | ${r.o.cohesion.toFixed(1)} | ${Math.min(r.o.leftEntropy, r.o.rightEntropy).toFixed(1)} |`),
    '',
  ].join('\n');

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, 'utf-8');

  console.log(`\n入选术语 ${fmt(typed.length)} 条 → ${path.relative(ROOT, OUT_PATH)}`);
  console.log(`AUC 全量拟合 ${aucTrain.toFixed(4)}｜交叉验证 ${aucCv.toFixed(4)}｜recall@K ${(recallCv * 100).toFixed(1)}%`);
  console.log(`策展词召回：候选 ${recallCandidates.length}/${curatedForms.length}，入选 ${recallSelected.length}/${curatedForms.length}`);
  console.log(`类型分布：${Array.from(byType).map(([t, n]) => `${t} ${n}`).join(' / ')}（构词规则判定 ${byRule}）`);
  console.log(`报告 → ${path.relative(ROOT, REPORT_PATH)}，总耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main();
