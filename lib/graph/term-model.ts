/**
 * 术语判别模型（逻辑回归 + 标准化，纯 TS，无第三方依赖）。
 *
 * 为什么用「学出来的打分」而不是手调阈值：
 * 频次、凝固度、自由度三个判据各自的阈值怎么定，本质上是在拍脑袋，
 * 而且三者要联合权衡（低频但极凝固的术语该留，高频但左右熵低的残片该丢）。
 * 用一个线性模型把权衡交给数据，还能顺带给出可读的权重方向，
 * 便于核对模型学到的规律是否合理。
 *
 * 监督信号从哪来（PU 设置）：
 * - 正例：人工策展词表中的词形。这是「领域专家认可的术语」这一目标概念的
 *   直接样本。曾用「出现在书名中」当正例，模型学成了频次排序器，
 *   「天下」「萬物」排到最前，符籙、雷法反被压到门槛之下。
 * - 负例：其余候选。其中混有真术语（策展覆盖不全），故是未标注而非真负例；
 *   泛化用策展词的交叉验证衡量，不再把同一批词既当标签又当评估集。
 *
 * 为什么不用更复杂的模型：特征约 11 个、样本上万，线性模型足够；
 * 引入梯度提升或神经网络会增加依赖与不可解释性，收益不明。
 */

export interface LogisticModel {
  weights: number[];
  bias: number;
  /** 标准化参数：预测时必须用训练时的同一组均值方差 */
  mean: number[];
  std: number[];
  /** 训练元信息，写进报告便于复现与回归对比 */
  meta: {
    samples: number;
    positives: number;
    epochs: number;
    learningRate: number;
    l2: number;
    positiveWeight: number;
    finalLoss: number;
  };
}

/** 确定性伪随机（线性同余）：训练集打乱必须可复现，否则每次构建结果都不同 */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function standardize(X: number[][]): { mean: number[]; std: number[] } {
  const d = X[0].length;
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(0);
  for (const row of X) for (let j = 0; j < d; j++) mean[j] += row[j];
  for (let j = 0; j < d; j++) mean[j] /= X.length;
  for (const row of X) for (let j = 0; j < d; j++) std[j] += (row[j] - mean[j]) ** 2;
  // 零方差特征的 std 兜底为 1，避免除零把权重炸成 NaN
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / X.length) || 1;
  return { mean, std };
}

function sigmoid(z: number): number {
  // 防溢出：z 很负时 Math.exp(-z) 会溢出为 Infinity
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

export interface FitOptions {
  epochs?: number;
  learningRate?: number;
  /** L2 正则系数，抑制单一特征吃掉全部权重 */
  l2?: number;
  seed?: number;
  /** 正例权重：弱监督下正例通常远少于负例 */
  positiveWeight?: number;
}

/** 小批量随机梯度下降训练逻辑回归 */
export function fitLogistic(X: number[][], y: number[], options: FitOptions = {}): LogisticModel {
  const epochs = options.epochs ?? 60;
  const lr = options.learningRate ?? 0.1;
  // 默认 L2 必须够强：正例只有百条、负例上万时，弱正则会把权重推到 ±12，
  // sigmoid 饱和，几乎所有入选得分都是 1.000，排序失去区分度。
  const l2 = options.l2 ?? 0.08;
  const posWeight = options.positiveWeight ?? 1;
  const rand = makeRandom(options.seed ?? 42);

  const { mean, std } = standardize(X);
  const Z = X.map(row => row.map((v, j) => (v - mean[j]) / std[j]));
  const d = Z[0].length;
  const weights = new Array(d).fill(0);
  let bias = 0;
  let finalLoss = 0;

  const order = Z.map((_, i) => i);
  for (let epoch = 0; epoch < epochs; epoch++) {
    // Fisher-Yates 打乱（确定性随机源）
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    let loss = 0;
    for (const i of order) {
      const row = Z[i];
      let z = bias;
      for (let j = 0; j < d; j++) z += weights[j] * row[j];
      const p = sigmoid(z);
      const w = y[i] === 1 ? posWeight : 1;
      const g = (p - y[i]) * w;
      for (let j = 0; j < d; j++) weights[j] -= lr * (g * row[j] + l2 * weights[j]);
      bias -= lr * g;
      const eps = 1e-12;
      loss -= w * (y[i] * Math.log(p + eps) + (1 - y[i]) * Math.log(1 - p + eps));
    }
    finalLoss = loss / Z.length;
  }

  return {
    weights,
    bias,
    mean,
    std,
    meta: {
      samples: X.length,
      positives: y.reduce((a, b) => a + b, 0),
      epochs,
      learningRate: lr,
      l2,
      positiveWeight: posWeight,
      finalLoss,
    },
  };
}

export function predictProba(model: LogisticModel, x: number[]): number {
  let z = model.bias;
  for (let j = 0; j < x.length; j++) {
    z += model.weights[j] * ((x[j] - model.mean[j]) / model.std[j]);
  }
  return sigmoid(z);
}

/** AUC（按排序对计算），用于报告模型区分能力 */
export function rocAuc(scores: number[], labels: number[]): number {
  const idx = scores.map((s, i) => ({ s, y: labels[i] })).sort((a, b) => a.s - b.s);
  let pos = 0;
  let neg = 0;
  for (const r of idx) {
    if (r.y === 1) pos++;
    else neg++;
  }
  if (pos === 0 || neg === 0) return 0.5;
  // 秩和法（Mann-Whitney U）；并列取平均秩
  let rank = 1;
  let posRankSum = 0;
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j < idx.length && idx[j].s === idx[i].s) j++;
    const avgRank = (rank + (rank + (j - i) - 1)) / 2;
    for (let k = i; k < j; k++) if (idx[k].y === 1) posRankSum += avgRank;
    rank += j - i;
    i = j;
  }
  return (posRankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}
