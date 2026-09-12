/**
 * 审核策略矩阵。
 *
 * 两地法律风险结构不同，故按 (region, kind) 交叉取值，
 * 不做 IP 级动态判定：区域由部署环境 DZ_REGION 决定，避免误判与绕过。
 */

export type ModerationPolicy = 'ai-fast' | 'ai-gate' | 'human-queue' | 'ai-then-human';
export type ContentKind = 'text-ugc' | 'media' | 'book';
export type Region = 'cn' | 'global';

const MATRIX: Record<Region, Record<ContentKind, ModerationPolicy>> = {
  cn: { 'text-ugc': 'ai-gate', media: 'human-queue', book: 'ai-gate' },
  global: { 'text-ugc': 'ai-fast', media: 'ai-fast', book: 'ai-then-human' },
};

export function currentRegion(): Region {
  return process.env.DZ_REGION === 'cn' ? 'cn' : 'global';
}

export function resolvePolicy(kind: ContentKind, region: Region = currentRegion()): ModerationPolicy {
  return MATRIX[region][kind];
}

/**
 * 新内容入库时的可见性。
 * 无 LLM 时：需要人工闸门的策略一律 pending；其余先发（AI 管线下一增量再接）。
 */
export function initialUgcStatus(kind: ContentKind = 'text-ugc'): 'approved' | 'pending' {
  const policy = resolvePolicy(kind);
  if (policy === 'human-queue' || policy === 'ai-then-human') return 'pending';
  return 'approved';
}
