/**
 * 把候选对齐到当前解析块，决定占位画在块前还是块后。
 * 只做视图拼接，不改 ParsedBook。
 */

import { ContentBlock } from '../content-schema';
import { overrideKey } from '../parser-overrides';
import type { IllustrationCandidate, IllustrationPlacement } from './candidates';
import { isShortClueBlock } from './detect-candidates';

export type { IllustrationPlacement as Placement };

export function placeCandidates(
  blocks: ContentBlock[],
  candidates: IllustrationCandidate[],
): IllustrationPlacement[] {
  const byAnchor = new Map(blocks.map(b => [overrideKey(b), b]));
  const placements: IllustrationPlacement[] = [];

  for (const candidate of candidates) {
    if (candidate.signal === 'title-tu' || !candidate.anchorKey || candidate.anchorKey === 'book:title') {
      continue;
    }
    const host = byAnchor.get(candidate.anchorKey);
    if (!host) continue;

    const hideBlockIds = (candidate.hideAnchorKeys ?? [])
      .map(key => byAnchor.get(key)?.id)
      .filter((id): id is string => Boolean(id));

    if (isShortClueBlock(host)) hideBlockIds.push(host.id);

    const headingLike =
      host.type === 'heading' || host.type === 'subheading' || isShortClueBlock(host);

    placements.push({
      candidate,
      afterBlockId: headingLike ? host.id : undefined,
      beforeBlockId: headingLike ? undefined : host.id,
      hideBlockIds: [...new Set(hideBlockIds)],
    });
  }

  return placements;
}
