/**
 * 新 UGC 的可见性决策：硬规则之后、入库之前（或 ai-gate 的异步复核）。
 */

import {
  insertModerationRecord,
  setUgcStatus,
  type UgcKind,
} from '@/lib/db';
import { readLlmApiKey } from '@/lib/agent/pi';
import { initialUgcStatus, resolvePolicy, type ModerationPolicy } from './policy';
import { reviewUgcText, type AiReview, type AiVerdict } from './review';

export type UgcStatus = 'approved' | 'pending' | 'hidden';

/**
 * 把 AI 结论映射成库里的可见性。
 * 解析失败走 flag：进人工队列，绝不默认放行。
 */
export function decideUgcStatus(policy: ModerationPolicy, verdict: AiVerdict): UgcStatus {
  // block 即使投稿制也不进人工队列，避免明显垃圾占用运营时间。
  if (verdict === 'block') return 'hidden';
  if (policy === 'human-queue') return 'pending';
  if (policy === 'ai-then-human') return verdict === 'allow' ? 'pending' : 'hidden';
  return verdict === 'allow' ? 'approved' : 'hidden';
}

export interface VisibilityPlan {
  status: UgcStatus;
  policy: ModerationPolicy;
  review: AiReview | null;
  /** ai-gate：先公开，响应后再跑 LLM，命中则下架 */
  defer: boolean;
}

export async function planTextUgcVisibility(input: {
  text: string;
  quote?: string;
}): Promise<VisibilityPlan> {
  const policy = resolvePolicy('text-ugc');

  if (policy === 'ai-gate') {
    return {
      status: 'approved',
      policy,
      review: null,
      defer: Boolean(readLlmApiKey()),
    };
  }

  const review = await reviewUgcText(input);
  if (!review) {
    return { status: initialUgcStatus('text-ugc'), policy, review: null, defer: false };
  }

  return {
    status: decideUgcStatus(policy, review.verdict),
    policy,
    review,
    defer: false,
  };
}

export async function persistAiReview(
  kind: UgcKind,
  id: string,
  policy: ModerationPolicy,
  review: AiReview,
): Promise<void> {
  await insertModerationRecord({
    targetType: kind,
    targetId: id,
    policy,
    reason: review.reason,
    aiModel: review.model,
    aiVerdict: review.verdict,
    aiScore: review.score,
    aiCategories: review.categories,
    aiLatencyMs: review.latencyMs,
  });
}

/** ai-gate 异步复核：不占用用户问道配额。 */
export async function applyDeferredAiReview(
  kind: UgcKind,
  id: string,
  text: string,
  quote?: string,
): Promise<void> {
  const review = await reviewUgcText({ text, quote });
  if (!review) return;
  const status = decideUgcStatus('ai-gate', review.verdict);
  if (status !== 'approved') {
    await setUgcStatus(kind, id, status);
  }
  await persistAiReview(kind, id, 'ai-gate', review);
}

/** 媒体/图书投稿：无 ai-gate 先发；文本说明送 LLM，文件本身不走视觉模型。 */
export async function planContributionVisibility(input: {
  contentKind: 'media' | 'book';
  text: string;
}): Promise<VisibilityPlan> {
  const policy = resolvePolicy(input.contentKind);
  const review = await reviewUgcText({ text: input.text });
  if (!review) {
    return { status: initialUgcStatus(input.contentKind), policy, review: null, defer: false };
  }
  return {
    status: decideUgcStatus(policy, review.verdict),
    policy,
    review,
    defer: false,
  };
}
