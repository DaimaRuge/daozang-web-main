/**
 * 审核硬规则前置。
 *
 * 命中后直接拒绝、不调用 LLM，用来挡住明显垃圾并控制审核成本。
 * 规则刻意保守：道藏讨论含大量宗教用语与外链学术资源，过宽的词表会误伤。
 */

export type RuleVerdict = { reject: false } | { reject: true; reason: string };

const URL_RE = /https?:\/\/[^\s]+/gi;

export function evaluateHardRules(text: string): RuleVerdict {
  const trimmed = text.trim();
  if (!trimmed) return { reject: true, reason: 'empty' };

  const urls = trimmed.match(URL_RE) ?? [];
  if (urls.length >= 4) return { reject: true, reason: 'too-many-urls' };

  if (/(.)\1{19,}/.test(trimmed)) return { reject: true, reason: 'repeated-char' };

  return { reject: false };
}
