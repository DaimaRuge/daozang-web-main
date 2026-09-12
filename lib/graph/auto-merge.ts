/**
 * 自动术语并入图谱的挑选规则。
 *
 * 为什么不按分数一刀切前 N：terms.auto.json 里分数接近的二字书面词
 * （瀑布、催促、團團）和神名/洞天挤在同一段排名。名额从 800 扩到 1000
 * 时，多给的 200 个若全填概念，图上会多出一批与道教学无关的邻居。
 * 故先按类型配额收神祇/山川/人物，概念再补足，并丢掉叠词与「登山」类动词残片。
 */

import type { AutoTermEntry } from './schema';

/** 并入图谱的自动术语上限：与策展词合计超过 1000，且 gzip 仍低于 10MB */
export const MAX_AUTO_TERMS = 1000;

export const AUTO_TYPE_CAPS: Record<string, number> = {
  place: 75,
  person: 80,
  deity: 200,
  ritual: 40,
  sect: 30,
};

/** 动词/介词粘在山名前面：履刀山、入華山、召五嶽，不是地名本身 */
const PLACE_VERB_PREFIX = /^[入遊告封履申登召諸]/;

export function isMergeablePlace(term: string): boolean {
  if (PLACE_VERB_PREFIX.test(term)) return false;
  if (term === '山嶽' || term === '山福地') return false;
  if (/洞天|福地|名山|宮觀/.test(term)) return true;
  if (term.endsWith('嶽')) return true;
  return term.length >= 3 && /[山嶽峰巖]$/.test(term);
}

/**
 * 概念补位：三字以上或带本体字根的二字予以保留；
 * 高凝固度二字（橐籥、蟬蛻）也保留。叠音词（團團、悠悠）不要。
 */
export function isMergeableConcept(term: string, cohesion: number): boolean {
  if (term.length === 2 && term[0] === term[1]) return false;
  if (term.length >= 3) return true;
  if (/[符籙丹炁醮齋咒訣罡印鼎爐鉛汞胎息黃庭清靜雷洞陰陽]/.test(term)) return true;
  return cohesion >= 12;
}

export function pickAutoTerms(
  unused: AutoTermEntry[],
  max = MAX_AUTO_TERMS,
): AutoTermEntry[] {
  const byType = new Map<string, AutoTermEntry[]>();
  for (const t of unused) {
    const list = byType.get(t.type) ?? [];
    list.push(t);
    byType.set(t.type, list);
  }
  for (const list of byType.values()) {
    list.sort((a, b) => b.score - a.score || b.docFreq - a.docFreq);
  }

  const picked: AutoTermEntry[] = [];
  for (const [type, cap] of Object.entries(AUTO_TYPE_CAPS)) {
    let list = byType.get(type) ?? [];
    if (type === 'place') list = list.filter(t => isMergeablePlace(t.term));
    picked.push(...list.slice(0, cap));
  }

  const rest = Math.max(0, max - picked.length);
  const concepts = (byType.get('concept') ?? []).filter(t =>
    isMergeableConcept(t.term, t.cohesion),
  );
  picked.push(...concepts.slice(0, rest));
  return picked;
}
