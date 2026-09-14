/**
 * 自动术语 → 策展上位：只根据词形推断 subclass_of。
 *
 * 为什么不靠共现：共现把「無為」连到几乎所有高频词，图上没有层次。
 * 为什么不用全部别名：策展别名含「自然」「道場」这类义项扩展，
 * 拿来做子串会把「希言自然」错挂到「無為」。
 * 别名只在「够长」或「是正名的组成部分」时参与（玉皇大帝、東嶽），
 * 二字通名作后缀一律不认（老君 → 中央黃老君）。
 * 推断边必须标 source=morphology，不得冒充词表策展。
 */

export interface TaxonomyParent {
  id: string;
  type: string;
  label: string;
  aliases?: string[];
}

export interface TaxonomyChild {
  term: string;
  type: string;
}

export interface TaxonomyLink {
  parentId: string;
  via: string;
  /** 后缀高于前缀，供 UI 与截断排序 */
  confidence: number;
}

/** 动词/介词粘在术语前：見老君、修黃籙齋、聞天尊，不是下位名 */
const NOISE_PREFIX = /^[見聞時入建設立尋告封履申登召諸修普傳]/;

/**
 * 正名对不上、但后缀几乎不会歧义的挂靠。
 * 不把光秃秃的「天尊」挂到三清——那是神名通名，不是三清的下位。
 */
const EXTRA_SUFFIX: Array<{ suffix: string; parentLabel: string; types?: string[] }> = [
  { suffix: '救苦天尊', parentLabel: '太乙救苦天尊', types: ['deity'] },
  { suffix: '洞天', parentLabel: '洞天福地', types: ['place', 'concept'] },
  { suffix: '福地', parentLabel: '洞天福地', types: ['place', 'concept'] },
  { suffix: '衡山', parentLabel: '南嶽', types: ['place'] },
  { suffix: '華山', parentLabel: '西嶽', types: ['place'] },
  { suffix: '嵩山', parentLabel: '中嶽', types: ['place'] },
  { suffix: '恒山', parentLabel: '北嶽', types: ['place'] },
  { suffix: '恆山', parentLabel: '北嶽', types: ['place'] },
];

/**
 * 词形上不是正名的子串，但部类/阴阳对待几乎不会歧义。
 * 「洞真」挂「三洞」，不要把洞真写成三洞的别名，否则扫描会吞掉下位。
 */
const EXACT_PARENT: Array<{ term: string; parentLabel: string; types?: string[] }> = [
  { term: '洞真', parentLabel: '三洞' },
  { term: '洞玄', parentLabel: '三洞' },
  { term: '洞神', parentLabel: '三洞' },
  { term: '大洞', parentLabel: '三洞' },
  { term: '少陽', parentLabel: '陰陽' },
  { term: '少陰', parentLabel: '陰陽' },
  { term: '高上玉皇', parentLabel: '玉皇' },
];

function typesCompatible(child: string, parent: string): boolean {
  if (child === parent) return true;
  return (
    (child === 'ritual' && parent === 'concept') ||
    (child === 'concept' && parent === 'ritual') ||
    // 高上玉皇一类神号被抽成概念，仍应挂到神祇正名
    (child === 'concept' && parent === 'deity')
  );
}

function scoreForm(
  term: string,
  form: string,
  mode: 'full' | 'prefix' | 'infix',
): number | null {
  if (form.length < 2 || term === form || term.length <= form.length) return null;
  if (!term.includes(form)) return null;
  const suffix = term.endsWith(form);
  const prefix = term.startsWith(form);
  if (mode === 'prefix') return prefix ? 10 + form.length : null;
  if (suffix) return 30 + form.length;
  if (prefix) return 10 + form.length;
  if (mode === 'infix') return 8 + form.length;
  return null;
}

function parentForms(parent: TaxonomyParent): Array<{ form: string; mode: 'full' | 'prefix' | 'infix' }> {
  const out: Array<{ form: string; mode: 'full' | 'prefix' | 'infix' }> = [
    { form: parent.label, mode: parent.type === 'deity' ? 'infix' : 'full' },
  ];
  for (const alias of parent.aliases ?? []) {
    const form = alias.trim();
    if (!form || form === parent.label) continue;
    if (form.length >= 3) {
      out.push({ form, mode: 'full' });
      continue;
    }
    // 二字别名只当前缀，且必须是正名的一部分：東嶽⊂東嶽大帝；老君作后缀会误收中央黃老君
    if (form.length === 2 && parent.label.includes(form)) {
      out.push({ form, mode: 'prefix' });
    }
  }
  return out;
}

/** 一条自动术语最多挂一个策展上位；找不到就保持孤立，等共现或人工审边。 */
export function inferTaxonomyLink(
  child: TaxonomyChild,
  parents: readonly TaxonomyParent[],
): TaxonomyLink | null {
  if (NOISE_PREFIX.test(child.term)) return null;

  for (const rule of EXACT_PARENT) {
    if (child.term !== rule.term) continue;
    if (rule.types && !rule.types.includes(child.type)) continue;
    const parent = parents.find(p => p.label === rule.parentLabel);
    if (!parent || !typesCompatible(child.type, parent.type)) continue;
    return { parentId: parent.id, via: rule.parentLabel, confidence: 0.85 };
  }

  let best: TaxonomyLink | null = null;
  let bestScore = -1;
  for (const parent of parents) {
    if (!typesCompatible(child.type, parent.type)) continue;
    for (const { form, mode } of parentForms(parent)) {
      const score = scoreForm(child.term, form, mode);
      if (score == null || score <= bestScore) continue;
      bestScore = score;
      best = {
        parentId: parent.id,
        via: form,
        confidence: child.term.endsWith(form) ? 0.8 : child.term.startsWith(form) ? 0.76 : 0.72,
      };
    }
  }
  if (best) return best;

  const extras = [...EXTRA_SUFFIX].sort((a, b) => b.suffix.length - a.suffix.length);
  for (const rule of extras) {
    if (rule.types && !rule.types.includes(child.type)) continue;
    if (child.term === rule.suffix) continue;
    if (!child.term.endsWith(rule.suffix)) continue;
    if (child.term.length <= rule.suffix.length) continue;
    const parent = parents.find(p => p.label === rule.parentLabel);
    if (!parent) continue;
    return { parentId: parent.id, via: rule.suffix, confidence: 0.78 };
  }
  return null;
}

/** 每个上位最多收这么多构词子女，按 confidence 再按词长截断 */
export const MAX_MORPHOLOGY_CHILDREN = 16;

export function pickTaxonomyLinks(
  children: TaxonomyChild[],
  parents: readonly TaxonomyParent[],
): Array<TaxonomyLink & { term: string }> {
  const raw: Array<TaxonomyLink & { term: string }> = [];
  for (const child of children) {
    const link = inferTaxonomyLink(child, parents);
    if (link) raw.push({ ...link, term: child.term });
  }
  const byParent = new Map<string, Array<TaxonomyLink & { term: string }>>();
  for (const row of raw) {
    const list = byParent.get(row.parentId) ?? [];
    list.push(row);
    byParent.set(row.parentId, list);
  }
  const picked: Array<TaxonomyLink & { term: string }> = [];
  for (const list of byParent.values()) {
    list.sort((a, b) => b.confidence - a.confidence || b.term.length - a.term.length);
    picked.push(...list.slice(0, MAX_MORPHOLOGY_CHILDREN));
  }
  return picked;
}
