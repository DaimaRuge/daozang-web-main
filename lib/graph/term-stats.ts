/**
 * 领域术语自动发现的统计层（纯函数，无 I/O）。
 *
 * 为什么需要它：策展词表靠人手写，覆盖面必然停在几十上百条；
 * 而道藏有 3500 万字，绝大多数术语没有人来录。这里用「语料自己说话」的
 * 统计量把候选术语从语料中挖出来，再交给 lib/graph/term-model.ts 打分。
 *
 * 三个经典判据（中文未登录词发现的标准做法）：
 * 1. 频次     —— 出现太少的串没有统计意义；
 * 2. 凝固度   —— 串内部各切分点的互信息取最小值。真词在任何切法下都「粘」得住，
 *               像「性命一也」这种偶然连排在某个切点上会松掉；
 * 3. 自由度   —— 串左右邻字的信息熵取较小者。真词能出现在多种上下文里，
 *               而「太上洞玄靈」这类残片总跟着同一个字，左右熵极低。
 *
 * 为什么不用分词器：现成中文分词器的词典与训练语料都是现代汉语，
 * 对文言与道教术语（「三洞四輔」「炁」「籙」）几乎失效，反而会把术语切碎。
 * 统计法不依赖词典，正适合这种专门语料。
 *
 * 本文件不做取舍判断（不设阈值黑名单），只产出可解释的数值特征；
 * 「什么算术语」由带监督信号的模型决定，便于评估与调参。
 */

/** 按非汉字字符切分短句：候选术语不得跨越标点，否则会捞出大量偶然连排 */
export function splitClauses(text: string): string[] {
  return text.split(/[^\u4e00-\u9fff]+/).filter(Boolean);
}

/**
 * 文言虚词/语法字。
 * 注意：只作为「特征」而非硬性过滤条件 —— 「無為」「太一」「三清」都由虚词或
 * 数词构成却是核心术语，一刀切会把它们全部误杀。
 */
const FUNCTION_CHARS = new Set(
  '之乎者也焉矣其而以於則不無有是此彼曰云耳夫且乃所與如若何為爲我汝爾吾亦皆各既即已未莫勿弗令使得能可當應須凡故雖但惟唯只更甚最尤頗殊自相共同及至於由從向對在被把將把等'.split(''),
);

/**
 * 数词与量词字。整串皆由这些字构成时不是术语（「十二」「二十四」），
 * 但含数词的术语必须留下（「三清」「五行」「九幽」「三洞四輔」），
 * 故判据是「全部字符都是数词」而非「包含数词」。
 */
const NUMERAL_CHARS = new Set('一二三四五六七八九十百千萬万零壹貳參肆伍陸柒捌玖廿卅半數数個个'.split(''));

/**
 * 文书占位符。科仪文书里大量「某年某月某日」「某州郡縣鄉里」「弟子某」
 * 是待填写的空格，统计上高频且凝固，却不指称任何事物。
 */
const PLACEHOLDER_CHARS = new Set('某'.split(''));

/** 不可能作为术语结尾的字（句末语气词、连接成分） */
const BAD_TAIL = new Set('也矣焉乎耳哉歟耶邪與而則之其所者以於乃且'.split(''));

/**
 * 不可能作为术语开头的字（承接、转折、副词、否定、校记用语）。
 *
 * 「不未莫勿弗」列入而「無」不列入，是因为二者构词能力不同：
 * 「不」引导的多是动词短语（不知、不可得），而「無」能构成名词性术语
 * （無為、無極、無量），后者恰是道教核心概念，一并砍掉就本末倒置了。
 * 「據」引导整理者按语（「據入意」「據道藏本」），不是术语。
 */
const BAD_HEAD = new Set('而則故乃亦又皆既雖但唯惟凡且以於之其所者是此彼焉矣也乎不未莫勿弗據'.split(''));

/**
 * 明显不是术语的形态过滤。
 * 只挡「语法上不可能」的情况，不做语义判断 —— 语义交给模型。
 */
export function isPlausibleTerm(term: string): boolean {
  if (term.length < 2 || term.length > 6) return false;
  if (BAD_HEAD.has(term[0])) return false;
  if (BAD_TAIL.has(term[term.length - 1])) return false;
  // 通篇虚词的长串没有术语价值。二字例外：無為、無極整词都由「虚词字」
  // 构成，却是道教核心概念；文件头已说明虚词表只作特征、不可一刀切。
  if (term.length >= 3 && functionCharRatio(term) >= 0.67) return false;
  // 纯数词串（「十二」「二十四」）频次高、分布广，统计上极像术语，必须显式排除
  let allNumeral = true;
  for (const ch of term) {
    if (!NUMERAL_CHARS.has(ch)) {
      allNumeral = false;
      break;
    }
  }
  if (allNumeral) return false;
  for (const ch of term) if (PLACEHOLDER_CHARS.has(ch)) return false;
  // 含 4 字以上连续数词的串是数字本身（「三百六十骨節」「三百六十五度」），
  // 而 3 字以内的数词前缀常构成真术语（「三十六天」「二十四治」），故按连长区分
  let run = 0;
  for (const ch of term) {
    run = NUMERAL_CHARS.has(ch) ? run + 1 : 0;
    if (run >= 4) return false;
  }
  // 叠字残片（「一一」「之之」）
  if (term.length === 2 && term[0] === term[1] && FUNCTION_CHARS.has(term[0])) return false;
  // 目录/书名残片：这些串统计上极像术语（高频、凝固、广布），却不指称概念
  if (term === '道藏' || term === '續道藏' || term === '正統') return false;
  if (term.length <= 3 && term.endsWith('經')) return false;
  if (term.length <= 4 && /(說|注)$/.test(term)) return false;
  // 整理者按语与科仪套语：统计上凝固，但不指称领域对象
  if (term.includes('四庫') || term === '年月日時') return false;
  if (/[東西南北中]方$/.test(term) && term.length <= 4) return false;
  return true;
}

export function functionCharRatio(term: string): number {
  let n = 0;
  for (const ch of term) if (FUNCTION_CHARS.has(ch)) n++;
  return n / term.length;
}

/**
 * 凝固度：各切分点互信息的最小值（以 2 为底）。
 *
 * 取最小值而不是平均值，是因为一个真词必须「处处粘合」：
 * 「靈寶領教」若在「靈寶|領教」处粘得住、在「靈|寶領教」处松掉，
 * 那它更可能是两个词的高频连排。取最小值能把这种情况压下去。
 */
export function cohesion(
  term: string,
  freq: (s: string) => number,
  totalChars: number,
): number {
  const pTerm = freq(term) / totalChars;
  if (pTerm <= 0) return -Infinity;
  let min = Infinity;
  for (let i = 1; i < term.length; i++) {
    const left = freq(term.slice(0, i)) / totalChars;
    const right = freq(term.slice(i)) / totalChars;
    if (left <= 0 || right <= 0) return -Infinity;
    const pmi = Math.log2(pTerm / (left * right));
    if (pmi < min) min = pmi;
  }
  return min;
}

/** 邻字分布的信息熵（以 2 为底）。分布越散说明该串越能独立使用 */
export function entropy(hist: Map<string, number>): number {
  let total = 0;
  for (const v of hist.values()) total += v;
  if (total === 0) return 0;
  let h = 0;
  for (const v of hist.values()) {
    const p = v / total;
    h -= p * Math.log2(p);
  }
  return h;
}

/** 一个候选串在语料中的原始观测量 */
export interface TermObservation {
  term: string;
  freq: number;
  /** 出现于多少部典籍 */
  docFreq: number;
  /** 单部典籍内最高出现占比（衡量是否只是某一部书的自造语） */
  maxDocShare: number;
  leftEntropy: number;
  rightEntropy: number;
  cohesion: number;
  /**
   * 作为子串出现在多少部典籍的标题中 —— 术语性的有力线索（道藏书名由术语构成）。
   *
   * 为什么记「多少部」而不是「是否出现过」：只出现在一个书名里的串往往是
   * 该书专属的题名残片（「抱朴子外篇」），会带出一堆单书专属短语；
   * 出现在多个书名里的串才是共享的领域词汇（「靈寶」「度人」「神咒」）。
   */
  titleDocFreq: number;
  /**
   * 部类分布偏离度（KL 散度，比特）。
   *
   * 为什么需要它：频次、自由度、文档数这些量无法区分「通用文言词」与
   * 「道教术语」—— 「天下」「左右」和「符籙」「雷法」在这些维度上长得一样。
   * 但两者的部类分布截然不同：通用词在三洞四輔各部里的占比与语料整体一致，
   * 而领域术语会明显偏向某几部（符籙偏正一部与洞神部）。
   * 用该串的部类分布相对语料整体分布的 KL 散度，即可把这种偏向量化出来。
   */
  categoryDivergence: number;
  /**
   * 残片比：最高频的一字延长串占本串频次的比例。
   *
   * 为什么单靠左右熵不够：「金木水火土五」几乎总跟着「行」，理应被自由度拦下，
   * 但句末哨兵与零星其他延续把它的熵抬到 2.16，越过了门槛。
   * 直接看「有多大比例的出现其实是某个更长串的一部分」更锋利：
   * 比例接近 1 就说明它只是残片，而不是能独立指称的术语。
   */
  fragmentRatio: number;
}

/**
 * 能否作为知识图谱节点的硬性前提。
 *
 * 这几条不是统计判断而是定义性要求，故不交给模型权衡：
 * - 只在一两部书里出现的串连不出关系，做成节点是死节点；
 * - 左右熵为 0 意味着它永远出现在同一个上下文里，那是固定格式的一部分，
 *   不是能独立指称事物的术语；
 * - 绝大多数出现都集中在单一典籍的串，是该书的自造语或题名残片。
 */
export function isGraphWorthy(o: TermObservation): boolean {
  return (
    o.docFreq >= MIN_DOC_FREQ &&
    Math.min(o.leftEntropy, o.rightEntropy) >= MIN_FREEDOM &&
    o.maxDocShare <= MAX_DOC_SHARE &&
    o.fragmentRatio <= MAX_FRAGMENT_RATIO &&
    // 凝固度为负说明该切分比随机拼字还松，不是词
    o.cohesion >= MIN_COHESION
  );
}

/** 残片比上限：超过此值说明该串的出现绝大多数属于某个更长串 */
export const MAX_FRAGMENT_RATIO = 0.7;

/** 术语至少要出现在这么多部典籍中，才可能在图谱里连出有意义的关系 */
export const MIN_DOC_FREQ = 5;
/** 左右邻字熵的下限（比特）：低于此值说明该串只活在固定格式里 */
export const MIN_FREEDOM = 1;
/** 单部典籍最多可占该串出现次数的比例 */
export const MAX_DOC_SHARE = 0.6;
/** 凝固度下限（比特）：低于此值的切分比随机拼字还松 */
export const MIN_COHESION = 0.5;
/**
 * 自动术语在语料中的典籍占比上限。超过此值的是「太上」「自然」这类
 * 几乎每部书都出现的泛词，做成额外节点只会把图连成一团；
 * 策展词表里的泛词（長生）仍保留，因为有人工释义与种子边。
 */
export const MAX_AUTO_DOC_RATIO = 0.38;

/**
 * 被更长串「解释」掉：残差既低于绝对频次门槛，又不到短串频次的 20%。
 *
 * 只看绝对残差会把「三清」(2468) 判给某个 ~2440 次的四字神号，
 * 但「三清」作为独立神名仍大量单用。二字且分布广的串更是词项本身，
 * 复合词吸收不掉它们（「雷法」不被「五雷法」解释掉）。
 */
export const ABSORB_INDEPENDENT_RATIO = 0.2;
/** 二字词出现在这么多部书里，即视为独立词项，不被更长串吸收 */
export const SHORT_TERM_INDEPENDENT_DOCS = 15;

export function isAbsorbedBy(
  shorter: Pick<TermObservation, 'term' | 'freq' | 'docFreq'>,
  longerFreq: number,
  minFreq: number,
): boolean {
  if (shorter.term.length <= 2 && shorter.docFreq >= SHORT_TERM_INDEPENDENT_DOCS) {
    return false;
  }
  const residual = shorter.freq - longerFreq;
  return residual < minFreq && residual < shorter.freq * ABSORB_INDEPENDENT_RATIO;
}

/**
 * 部类分布偏离度：KL(该串的部类分布 ‖ 语料整体部类分布)。
 * 平滑处理避免某部零出现时散度爆成无穷。
 */
export function categoryDivergence(
  termByCategory: Map<string, number>,
  corpusByCategory: Map<string, number>,
): number {
  let termTotal = 0;
  for (const v of termByCategory.values()) termTotal += v;
  let corpusTotal = 0;
  for (const v of corpusByCategory.values()) corpusTotal += v;
  if (termTotal === 0 || corpusTotal === 0) return 0;

  const categories = Array.from(corpusByCategory.keys());
  const alpha = 0.5; // 加性平滑
  let kl = 0;
  for (const c of categories) {
    const p = ((termByCategory.get(c) ?? 0) + alpha) / (termTotal + alpha * categories.length);
    const q = ((corpusByCategory.get(c) ?? 0) + alpha) / (corpusTotal + alpha * categories.length);
    if (p > 0 && q > 0) kl += p * Math.log2(p / q);
  }
  return kl;
}

/** 特征名（与 features() 的顺序严格对应，供模型报告解释权重） */
export const FEATURE_NAMES = [
  'log频次',
  '凝固度',
  '自由度(左右熵较小者)',
  '左右熵差异',
  'log典籍数',
  '单书集中度',
  '虚词占比',
  '串长',
  '部类分布偏离度',
  '非残片比',
  'log书名出现数',
];

/**
 * 特征向量。
 * 刻意保持少而可解释：这些量都能对应到「为什么它像术语」的人话，
 * 便于在报告里核对模型学到的方向是否合理。
 */
export function features(o: TermObservation): number[] {
  return [
    Math.log2(1 + o.freq),
    o.cohesion,
    Math.min(o.leftEntropy, o.rightEntropy),
    Math.abs(o.leftEntropy - o.rightEntropy),
    Math.log2(1 + o.docFreq),
    o.maxDocShare,
    functionCharRatio(o.term),
    o.term.length,
    o.categoryDivergence,
    // 残片比越低越好，故取补：直接放原值会让模型学成「越残片越像术语」
    // （策展正例常作为书名子串出现，残片比偏高，是标签带来的方向错误）
    1 - o.fragmentRatio,
    Math.log2(1 + o.titleDocFreq),
  ];
}

/**
 * 无监督领域术语分（0~1）。
 *
 * 为什么还要它：策展正例只有百条，且偏「出现在许多书名里的高频词」
 * （上清、靈寶）。逻辑回归据此会把「太上」「真經」排到最前，
 * 而图谱更需要中频、部类分布偏离的专门术语（符籙、雷法、禹步）。
 * 此式按领域常识加权，不吃标签偏差；与模型得分混合后用于入选排序。
 */
export function domainTermScore(o: TermObservation, corpusDocs: number): number {
  const coh = Math.max(0, Math.min(o.cohesion, 10)) / 10;
  const free = Math.min(Math.min(o.leftEntropy, o.rightEntropy), 5) / 5;
  const div = Math.min(Math.max(0, o.categoryDivergence), 2.5) / 2.5;
  const frag = 1 - o.fragmentRatio;
  const func = 1 - functionCharRatio(o.term);
  const dfRatio = corpusDocs > 0 ? o.docFreq / corpusDocs : 0;
  // 中频最好：峰值约 5% 典籍。太稀连不出边，太泛人人都连。
  const dfScore =
    dfRatio <= 0 ? 0 : Math.exp(-(((Math.log(dfRatio) - Math.log(0.05)) / 1.5) ** 2));
  return 0.22 * coh + 0.18 * free + 0.28 * div + 0.16 * frag + 0.08 * func + 0.08 * dfScore;
}
