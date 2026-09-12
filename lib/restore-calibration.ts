/**
 * 原书插图复原的人工校定。
 *
 * 浏览用户并排对照原扫描与高清朱砂/墨线复原，提交「确认 / 不通过」和备注。
 * 后台只根据备注分类后续处理，绝不自动覆盖原扫描或复原文件。
 *
 * 本文件不碰磁盘，阅读器客户端可安全引用 calibrateHref。
 */

import { daozangImageUrl, parseDaozangImageUrl, restoredStem } from '@/lib/daozang-image-url';

export const CALIBRATION_VERDICTS = ['pass', 'fail'] as const;
export type CalibrationVerdict = (typeof CALIBRATION_VERDICTS)[number];

export const CALIBRATION_VARIANTS = ['cinnabar', 'ink', 'restored'] as const;
export type CalibrationVariant = (typeof CALIBRATION_VARIANTS)[number];

export const CALIBRATION_ACTIONS = ['keep', 'retint', 'reknockout', 'geometry', 'other'] as const;
export type CalibrationAiAction = (typeof CALIBRATION_ACTIONS)[number];

export interface RestoredTonePresence {
  ink: boolean;
  cinnabar: boolean;
  restored: boolean;
}

export interface CalibrationAiResult {
  action: CalibrationAiAction;
  summary: string;
  source: 'heuristic' | 'llm';
}

export interface CalibrationNeighbor {
  part: string;
  file: string;
}

const ACTION_LABEL: Record<CalibrationAiAction, string> = {
  keep: '维持现复原',
  retint: '重染朱砂',
  reknockout: '重抠纸色',
  geometry: '核对结构',
  other: '人工查看备注',
};

export function calibrationActionLabel(action: CalibrationAiAction): string {
  return ACTION_LABEL[action];
}

export function isCalibrationVerdict(value: unknown): value is CalibrationVerdict {
  return value === 'pass' || value === 'fail';
}

export function isCalibrationVariant(value: unknown): value is CalibrationVariant {
  return value === 'cinnabar' || value === 'ink' || value === 'restored';
}

export function isCalibrationAction(value: unknown): value is CalibrationAiAction {
  return (
    value === 'keep' ||
    value === 'retint' ||
    value === 'reknockout' ||
    value === 'geometry' ||
    value === 'other'
  );
}

/** 拒绝路径穿越；部名与文件名必须是单段。 */
export function isSafeImageSegment(value: string): boolean {
  return Boolean(value) && !value.includes('..') && !value.includes('/') && !value.includes('\\');
}

export function calibrateHref(
  bookId: string,
  originalSrc: string,
  variant: CalibrationVariant = 'cinnabar',
): string | null {
  const parsed = parseDaozangImageUrl(originalSrc);
  if (!parsed || !bookId) return null;
  const qs = new URLSearchParams({ part: parsed.part, file: parsed.file });
  if (variant !== 'cinnabar') qs.set('variant', variant);
  return `/text/${encodeURIComponent(bookId)}/calibrate?${qs.toString()}`;
}

export function variantFile(originalFile: string, variant: CalibrationVariant): string {
  const stem = restoredStem(originalFile);
  if (variant === 'cinnabar') return `${stem}.cinnabar.png`;
  if (variant === 'ink') return `${stem}.ink.png`;
  return `${stem}.png`;
}

export function pickDefaultVariant(
  presence: RestoredTonePresence,
  preferred: CalibrationVariant = 'cinnabar',
): CalibrationVariant | null {
  const order: CalibrationVariant[] = [preferred, 'cinnabar', 'ink', 'restored'];
  for (const variant of order) {
    if (variant === 'cinnabar' && presence.cinnabar) return 'cinnabar';
    if (variant === 'ink' && presence.ink) return 'ink';
    if (variant === 'restored' && presence.restored) return 'restored';
  }
  return null;
}

export function availableVariants(presence: RestoredTonePresence): CalibrationVariant[] {
  const out: CalibrationVariant[] = [];
  if (presence.cinnabar) out.push('cinnabar');
  if (presence.ink) out.push('ink');
  if (presence.restored) out.push('restored');
  return out;
}

export function neighboringRestored(
  images: CalibrationNeighbor[],
  file: string,
): { prev: CalibrationNeighbor | null; next: CalibrationNeighbor | null } {
  const idx = images.findIndex(item => item.file === file);
  if (idx < 0) return { prev: null, next: null };
  return {
    prev: idx > 0 ? images[idx - 1] : null,
    next: idx < images.length - 1 ? images[idx + 1] : null,
  };
}

export function imagePairUrls(part: string, originalFile: string, variant: CalibrationVariant) {
  return {
    originalUrl: daozangImageUrl(part, originalFile),
    restoredUrl: daozangImageUrl(part, variantFile(originalFile, variant)),
  };
}

const RETINT_RE = /偏色|偏淡|太红|太淡|太浅|太深|颜色|色偏|朱砂不准|不够红|发灰/;
const KNOCKOUT_RE = /抠|纸色|底色|白边|透明|没抠干净|背景|残底|黄底/;
const GEOMETRY_RE = /歪|错位|变形|缺笔|多了|少了|不像|对不上|结构|走形|糊成|缺划/;

/**
 * 无模型时也能分类。确认且无备注 → keep；不通过按关键词分流。
 */
export function classifyCalibrationHeuristic(
  verdict: CalibrationVerdict,
  note: string,
): CalibrationAiResult {
  const text = note.trim();
  if (verdict === 'pass' && !text) {
    return { action: 'keep', summary: '读者确认复原可用。', source: 'heuristic' };
  }
  if (RETINT_RE.test(text)) {
    return { action: 'retint', summary: clipSummary(text, '朱砂颜色需再调。'), source: 'heuristic' };
  }
  if (KNOCKOUT_RE.test(text)) {
    return { action: 'reknockout', summary: clipSummary(text, '透明底或纸色需重抠。'), source: 'heuristic' };
  }
  if (GEOMETRY_RE.test(text) || (verdict === 'fail' && !text)) {
    return {
      action: 'geometry',
      summary: clipSummary(text, '笔画或结构可能与原图不符。'),
      source: 'heuristic',
    };
  }
  if (verdict === 'fail') {
    return { action: 'other', summary: clipSummary(text, '不通过，需人工查看备注。'), source: 'heuristic' };
  }
  return { action: 'keep', summary: clipSummary(text, '读者确认复原可用。'), source: 'heuristic' };
}

function clipSummary(note: string, fallback: string): string {
  const trimmed = note.replace(/\s+/g, ' ').trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, 80);
}

export function parseCalibrationAiPayload(raw: unknown): CalibrationAiResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isCalibrationAction(o.action)) return null;
  const summary =
    typeof o.summary === 'string' && o.summary.trim()
      ? o.summary.trim().slice(0, 80)
      : ACTION_LABEL[o.action];
  return { action: o.action, summary, source: 'llm' };
}

const LLM_SYSTEM = [
  '你是「道可道」原书插图复原的质检助手。',
  '读者对照的是原扫描（左）与高清复原 PNG（右，多为朱砂透明底）。复原是 AI 增强，不是原文。',
  '根据评价和备注，只输出一段 JSON：{"action":"keep|retint|reknockout|geometry|other","summary":"不超过80字"}',
  'keep：确认可用，或备注与复原无关。',
  'retint：朱砂颜色不准。',
  'reknockout：纸色/透明底没处理好。',
  'geometry：笔画、结构、位置与原图对不上。',
  'other：无法归类，交给人工。',
  '不要改写典籍，不要建议覆盖原扫描。',
].join('\n');

export async function classifyCalibrationWithLlm(
  verdict: CalibrationVerdict,
  note: string,
  chat: (messages: { role: 'system' | 'user'; content: string }[]) => Promise<string>,
): Promise<CalibrationAiResult | null> {
  const text = await chat([
    { role: 'system', content: LLM_SYSTEM },
    {
      role: 'user',
      content: `评价：${verdict === 'pass' ? '确认' : '不通过'}\n备注：${note.trim() || '（无）'}`,
    },
  ]);
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return parseCalibrationAiPayload(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return null;
  }
}
