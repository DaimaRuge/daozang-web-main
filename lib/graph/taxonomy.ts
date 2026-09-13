/**
 * 自动术语 → 策展上位：只根据词形推断 subclass_of。
 *
 * 为什么不靠共现：共现把「無為」连到几乎所有高频词，图上没有层次。
 * 为什么不用别名表：策展别名含「自然」「道場」这类义项扩展，
 * 拿来做子串会把「希言自然」错挂到「無為」。
 * 只认策展正名，再加少数不会歧义的后缀（救苦天尊、洞天、福地）。
 * 推断边必须标 source=morphology，UI 显示「构词推断」，不得冒充词表策展。
 */

export interface TaxonomyParent {
  id: string;
  type: string;
  label: string;
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

/** 动词/介词粘在术语前：見老君、修黃籙齋、普告三界，不是下位名 */
const NOISE_PREFIX = /^[見時入建設立尋告封履申登召諸修普]/;

/**
 * 正名对不上、但后缀几乎不会歧义的挂靠。
 * 按后缀长度降序匹配，避免「天尊」抢在「靈寶天尊」前面。
 * 不把光秃秃的「天尊」挂到三清——那是神名通名，不是三清的下位。
 */
const EXTRA_SUFFIX: Array<{ suffix: string; parentLabel: string; types?: string[] }> = [
  { suffix: '救苦天尊', parentLabel: '太乙救苦天尊', types: ['deity'] },
  { suffix: '洞天', parentLabel: '洞天福地', types: ['place', 'concept'] },
  { suffix: '福地', parentLabel: '洞天福地', types: ['place', 'concept'] },
];

function typesCompatible(child: string, parent: string): boolean {
  if (child === parent) return true;
  return (
    (child === 'ritual' && parent === 'concept') ||
    (child === 'concept' && parent === 'ritual')
  );
}

function scoreContainment(term: string, form: string): number | null {
  if (form.length < 2 || term === form || term.length <= form.length) return null;
  if (!term.includes(form)) return null;
  const suffix = term.endsWith(form);
  const prefix = term.startsWith(form);
  if (!suffix && !prefix) return null;
  return (suffix ? 30 : 10) + form.length;
}

/** 一条自动术语最多挂一个策展上位；找不到就保持孤立，等共现或人工审边。 */
export function inferTaxonomyLink(
  child: TaxonomyChild,
  parents: readonly TaxonomyParent[],
): TaxonomyLink | null {
  if (NOISE_PREFIX.test(child.term)) return null;

  let best: TaxonomyLink | null = null;
  let bestScore = -1;
  for (const parent of parents) {
    if (!typesCompatible(child.type, parent.type)) continue;
    const score = scoreContainment(child.term, parent.label);
    if (score == null || score <= bestScore) continue;
    bestScore = score;
    best = {
      parentId: parent.id,
      via: parent.label,
      confidence: child.term.endsWith(parent.label) ? 0.8 : 0.76,
    };
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

/** 每个上位最多收这么多构词子女，按 confidence 再按词长截断，避免洞天福地被山名淹没 */
export const MAX_MORPHOLOGY_CHILDREN = 12;

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
