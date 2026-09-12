/**
 * 用户产出内容（UGC）的共享约束与清洗。
 *
 * 旁注与评论共用：长度上限、每日限流阈值、纯文本清洗（防注入/控制字符）。
 * 渲染端仍以纯文本方式输出（React 默认转义），此处只做入库前的规整。
 */

export const UGC_LIMITS = {
  /** 旁注正文最大字符数 */
  annotationMaxLen: 1000,
  /** 评论正文最大字符数 */
  commentMaxLen: 2000,
  /** 锚定原文引用最大字符数（超出截断存储） */
  quoteMaxLen: 500,
  /** 插图校定备注最大字符数 */
  calibrationNoteMaxLen: 500,
  /** 单用户每日发布上限（旁注 + 评论 + 投稿 + 校定合计） */
  dailyPerUser: 30,
} as const;

/** 去除控制字符、折叠多余空行、去首尾空白 */
export function sanitizeUgcText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  const cleaned = input
    // 去除除换行/制表符外的控制字符
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    // 连续 3+ 空行折叠为 2 行
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned.slice(0, maxLen);
}
