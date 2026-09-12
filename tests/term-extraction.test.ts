/**
 * 领域术语自动抽取：统计层、判别模型、类型归属。
 *
 * 这些是离线流水线的纯函数，必须能在没有全库语料的情况下回归。
 * 全库跑批（npm run extract-terms）的质量另见 docs/term-extraction-report.md。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
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
  splitClauses,
  TermObservation,
} from '../lib/graph/term-stats';
import { fitLogistic, predictProba, rocAuc } from '../lib/graph/term-model';
import { assignType, typeByMorphology } from '../lib/graph/term-typing';

function obs(partial: Partial<TermObservation> & { term: string }): TermObservation {
  return {
    freq: 100,
    docFreq: 20,
    maxDocShare: 0.2,
    leftEntropy: 2,
    rightEntropy: 2,
    cohesion: 4,
    titleDocFreq: 0,
    categoryDivergence: 0.4,
    fragmentRatio: 0.2,
    ...partial,
  };
}

// ---------- 切分与形态 ----------

test('短句按非汉字切分，候选不跨标点', () => {
  assert.deepEqual(splitClauses('符籙之法，先建齋醮。'), ['符籙之法', '先建齋醮']);
});

test('形态：無為可通过（虚词占比不得误杀二字核心概念）', () => {
  assert.equal(isPlausibleTerm('無為'), true);
  assert.equal(isPlausibleTerm('無極'), true);
  assert.equal(isPlausibleTerm('符籙'), true);
});

test('形态：纯数词、占位符、四连数词、虚词开头均排除', () => {
  assert.equal(isPlausibleTerm('十二'), false);
  assert.equal(isPlausibleTerm('二十四'), false);
  assert.equal(isPlausibleTerm('某年某月'), false);
  assert.equal(isPlausibleTerm('三百六十骨節'), false);
  assert.equal(isPlausibleTerm('不可得'), false);
  assert.equal(isPlausibleTerm('者也'), false);
});

test('形态：目录残片与书名后缀排除', () => {
  assert.equal(isPlausibleTerm('道藏'), false);
  assert.equal(isPlausibleTerm('真經'), false);
  assert.equal(isPlausibleTerm('天尊說'), false);
  assert.equal(isPlausibleTerm('四庫本'), false);
  assert.equal(isPlausibleTerm('東北方'), false);
  assert.equal(isPlausibleTerm('據入意'), false);
});

// ---------- 统计量 ----------

test('凝固度：真词切分点 PMI 高于松散连排', () => {
  const freq = (s: string) =>
    ({ 符: 800, 籙: 400, 符籙: 300, 之: 5000, 於: 4000, 之於: 40 }[s] ?? 0);
  const total = 100_000;
  assert.ok(cohesion('符籙', freq, total) > cohesion('之於', freq, total));
});

test('熵：均匀分布高于单峰', () => {
  const peaked = new Map([['甲', 90], ['乙', 10]]);
  const flat = new Map([['甲', 25], ['乙', 25], ['丙', 25], ['丁', 25]]);
  assert.ok(entropy(flat) > entropy(peaked));
  assert.equal(entropy(new Map()), 0);
});

test('部类偏离：分布与语料一致时接近 0，偏一部时明显升高', () => {
  const corpus = new Map([['正一部', 100], ['洞真部', 100]]);
  const even = new Map([['正一部', 50], ['洞真部', 50]]);
  const skewed = new Map([['正一部', 99], ['洞真部', 1]]);
  assert.ok(categoryDivergence(skewed, corpus) > categoryDivergence(even, corpus));
});

test('图谱适用性硬门槛', () => {
  assert.equal(isGraphWorthy(obs({ term: '內丹' })), true);
  assert.equal(isGraphWorthy(obs({ term: '承負', docFreq: 3 })), false);
  assert.equal(isGraphWorthy(obs({ term: '殘片', fragmentRatio: 0.9 })), false);
  assert.equal(isGraphWorthy(obs({ term: '專書語', maxDocShare: 0.8 })), false);
  assert.equal(isGraphWorthy(obs({ term: '固定格式', leftEntropy: 0.2, rightEntropy: 0.2 })), false);
  assert.equal(isGraphWorthy(obs({ term: '松散连排', cohesion: -1 })), false);
});

test('子串吸收：二字广布词项不被更长复合词吃掉', () => {
  const sanqing = obs({ term: '三清', freq: 2468, docFreq: 450 });
  assert.equal(isAbsorbedBy(sanqing, 2440, 30), false);

  const leifa = obs({ term: '雷法', freq: 154, docFreq: 29 });
  assert.equal(isAbsorbedBy(leifa, 140, 30), false);

  const fragment = obs({ term: '太上洞玄', freq: 80, docFreq: 8 });
  assert.equal(isAbsorbedBy(fragment, 70, 30), true);
});

test('特征向量长度与特征名一致', () => {
  const x = features(obs({ term: '符籙' }));
  assert.equal(x.length, FEATURE_NAMES.length);
  assert.ok(x.every(n => Number.isFinite(n)));
});

test('领域分：中频且部类偏离的术语高于广布泛词', () => {
  const fulu = obs({ term: '符籙', freq: 378, docFreq: 101, cohesion: 4.27, categoryDivergence: 0.46, fragmentRatio: 0.2 });
  const taishang = obs({ term: '太上', freq: 20236, docFreq: 1032, cohesion: 5, categoryDivergence: 0.08, fragmentRatio: 0.3 });
  assert.ok(
    domainTermScore(fulu, 1504) > domainTermScore(taishang, 1504),
    `符籙=${domainTermScore(fulu, 1504).toFixed(3)} 太上=${domainTermScore(taishang, 1504).toFixed(3)}`,
  );
});

// ---------- 模型 ----------

test('逻辑回归能分开线性可分样本，且 L2 抑制权重爆炸', () => {
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < 80; i++) {
    X.push([3 + Math.random(), 0.1, 2, 0.2, 3, 0.1, 0.1, 2, 0.8, 0.1, 1]);
    y.push(1);
  }
  for (let i = 0; i < 80; i++) {
    X.push([0.5 + Math.random() * 0.3, -1, 0.4, 2, 0.5, 0.8, 0.9, 5, 0.05, 0.9, 0]);
    y.push(0);
  }
  const model = fitLogistic(X, y, { epochs: 40, learningRate: 0.1, l2: 0.08, seed: 1 });
  const scores = X.map(x => predictProba(model, x));
  assert.ok(rocAuc(scores, y) > 0.9, `AUC=${rocAuc(scores, y)}`);
  assert.ok(
    model.weights.every(w => Math.abs(w) < 8),
    `权重饱和：${model.weights.map(w => w.toFixed(2)).join(',')}`,
  );
});

test('AUC 在标签全同或分数乱序时有定义', () => {
  assert.equal(rocAuc([0.1, 0.9], [1, 1]), 0.5);
  assert.ok(rocAuc([0.9, 0.1], [1, 0]) > 0.9);
});

// ---------- 类型 ----------

test('构词规则：神祇 / 人物 / 科仪 / 地域 / 宗派；通名本身不定类型', () => {
  assert.equal(typeByMorphology('元始天尊')?.type, 'deity');
  assert.equal(typeByMorphology('白玉蟾真人')?.type, 'person');
  assert.equal(typeByMorphology('黃籙齋儀')?.type, 'ritual');
  assert.equal(typeByMorphology('齋醮')?.type, 'ritual');
  assert.equal(typeByMorphology('燈儀')?.type, 'ritual');
  assert.equal(typeByMorphology('青城山')?.type, 'place');
  assert.equal(typeByMorphology('清微道派')?.type, 'sect');
  assert.equal(typeByMorphology('符籙'), null);
  assert.equal(typeByMorphology('天尊'), null, '光「天尊」是类型通名');
  assert.equal(typeByMorphology('真人'), null);
});

test('类型综合：规则优先，否则归为概念且不采用分布 hint 定类型', () => {
  const docs = new Set(['a', 'b']);
  const seeds = [{ type: 'deity' as const, docs: new Set(['a', 'b', 'c']) }];
  const named = assignType('靈寶天尊', docs, seeds);
  assert.equal(named.type, 'deity');
  const plain = assignType('三洞四輔', docs, seeds);
  assert.equal(plain.type, 'concept', '分布相似不得把三洞四輔标成神祇');
  assert.ok(plain.hint);
});

// ---------- 内容边界 ----------

test('抽取脚本对原文目录只读', () => {
  const script = fs.readFileSync(path.resolve(process.cwd(), 'scripts/extract-terms.ts'), 'utf-8');
  const writes = script.match(/writeFileSync\([^)]*/g) ?? [];
  assert.ok(writes.length > 0);
  for (const w of writes) {
    assert.ok(
      !/CONTENT_DIR|INDEX_PATH/.test(w),
      `抽取脚本不得写回原文或索引：${w}`,
    );
  }
});
