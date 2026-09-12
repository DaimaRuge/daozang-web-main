/**
 * 对话检索的概念候选词提取。
 *
 * 停用词切分能处理「什么是清静无为」这类问句，但切不开
 * 「道藏里讲橐籥的地方」里嵌着的术语。词表扩到 1000+ 之后，
 * 用同一套 Aho-Corasick（最长匹配优先）先抽本体，再把没盖住的
 * 片段交给停用词规则补位。词表缺失时行为与原来完全一致。
 */

import { AhoCorasick } from '../graph/matcher';

/** 疑问/功能词：长短语必须排在其包含的短词之前，以免留下残字 */
const STOPWORDS_RE = new RegExp(
  [
    '有什么', '是什么', '什么是', '什么叫', '为什么', '什么样', '什么',
    '怎么样', '怎么', '如何', '为何', '是不是', '有没有', '有哪些',
    '哪些', '哪个', '哪里', '谁是', '多少',
    '请问', '请解释', '解释一下', '介绍一下', '讲讲', '说说', '告诉我',
    '的意思', '的含义', '意思', '含义', '区别', '关系', '异同',
    '是', '的', '和', '与', '或', '了', '吗', '呢', '啊', '这', '那', '它', '一下',
  ].join('|'),
  'g',
);

export interface ExtractConceptsOptions {
  /** 词表表面词形（含别名）。有则先按最长匹配抽取 */
  lexicon?: readonly string[];
  /** 简繁变体展开，用于简体问句命中繁体词表 */
  variants?: (text: string) => string[];
  /**
   * 把表面词形收成实体 id。同一节点的别名（无为 / 清靜無為）只留一条，
   * 避免问答参考资料被同一个概念占满。
   */
  canonicalId?: (term: string) => string | undefined;
}

const acCache = new WeakMap<readonly string[], AhoCorasick>();

function automatonFor(lexicon: readonly string[]): AhoCorasick {
  const cached = acCache.get(lexicon);
  if (cached) return cached;
  const ac = new AhoCorasick([...lexicon]);
  acCache.set(lexicon, ac);
  return ac;
}

function splitStopwordFragments(text: string): string[] {
  const cleaned = text.replace(STOPWORDS_RE, '，');
  return cleaned
    .split(/[，。？！、；：\s「」『』（）()？?!.,]+/)
    .map(s => s.trim())
    .filter(s => /^[\u3400-\u9fff]{2,8}$/.test(s));
}

function sameTerm(
  a: string,
  b: string,
  variants?: (text: string) => string[],
): boolean {
  if (a === b) return true;
  if (!variants) return false;
  const left = new Set(variants(a));
  return variants(b).some(v => left.has(v));
}

/** 概念候选：词表最长匹配优先，停用词切分补位，最多 3 个 */
export function extractConcepts(
  question: string,
  options: ExtractConceptsOptions = {},
): string[] {
  const withoutTitles = question.replace(/《[^》]*》/g, '，');
  const { lexicon, variants, canonicalId } = options;
  const picked: string[] = [];
  const seenIds = new Set<string>();

  if (lexicon && lexicon.length > 0) {
    const ac = automatonFor(lexicon);
    const texts = variants
      ? Array.from(new Set([withoutTitles, ...variants(withoutTitles)]))
      : [withoutTitles];
    const seen = new Set<string>();
    for (const text of texts) {
      for (const hit of ac.scan(text)) {
        const form = lexicon[hit.patternIndex];
        if (!form || seen.has(form)) continue;
        if (picked.some(p => sameTerm(p, form, variants))) continue;
        const id = canonicalId?.(form);
        if (id) {
          if (seenIds.has(id)) continue;
          seenIds.add(id);
        }
        seen.add(form);
        picked.push(form);
      }
    }
    // 词表已命中时不再用停用词残片补位：「道藏里讲橐籥」只留橐籥，
    // 不把「道藏里讲」「地方在哪」送去全文检索。
    if (picked.length > 0) return picked.slice(0, 3);
  }

  return Array.from(new Set(splitStopwordFragments(withoutTitles))).slice(0, 3);
}
