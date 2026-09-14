/**
 * 审核队列与共现批量裁定。
 *
 * 一万多条待考里，多半是文献近邻（书与书）和「無為/長生」广布共现。
 * 前者算法分本来就该标待考，不值得一条条人工点；
 * 后者确认成「人工审定」会污染图，否决则从邻域拿掉泛词连线。
 * 高信号共现（近义或同域且非广布）才确认。
 */

import type { GraphEdge, GraphNode, GraphNodeType } from './schema';
import { LOW_CONFIDENCE } from '../content-schema';
import {
  isNearAlias,
  sharesContentChar,
  typesCompatibleForExtract,
} from './proposals';

export const HUB_WORKS = 420;

export type CooccurDecision = 'confirm' | 'reject' | 'defer';

export function isHubNode(node: GraphNode): boolean {
  return (node.works ?? 0) > HUB_WORKS;
}

export function decideCooccurEdge(
  edge: Pick<GraphEdge, 'weight'>,
  a: GraphNode,
  b: GraphNode,
): CooccurDecision {
  const near = isNearAlias(a.label, b.label);
  const share = sharesContentChar(a.label, b.label);
  const typesOk = typesCompatibleForExtract(a.type as GraphNodeType, b.type as GraphNodeType);
  const w = edge.weight ?? 0;
  const hub = isHubNode(a) || isHubNode(b);

  if (near && w >= 2) return 'confirm';
  if (share && typesOk && w >= 4 && !hub) return 'confirm';
  if (hub && !near) return 'reject';
  if (!share && !near) return 'reject';
  return 'defer';
}

/** 文献近邻不进队列；共现只收政策裁定为确认的高信号边。否决由批量脚本落盘。 */
export function shouldQueueForReview(
  edge: GraphEdge,
  from: GraphNode | undefined,
  to: GraphNode | undefined,
): boolean {
  if (edge.confidence >= LOW_CONFIDENCE) return false;
  if (edge.source === 'extract' || edge.source === 'llm') return true;
  if (edge.source !== 'cooccur' || !from || !to) return false;
  return decideCooccurEdge(edge, from, to) === 'confirm';
}
