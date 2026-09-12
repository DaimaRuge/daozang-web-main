/**
 * 图谱校正层的纯类型（可进客户端包）。
 * 读写与叠加逻辑在 overrides.ts，那里依赖 fs，客户端不得 import。
 */

import type { GraphEdgeSource, GraphEdgeType } from './schema';

export type GraphEdgeDecision = 'confirm' | 'reject';

export interface GraphEdgeOverride {
  decision: GraphEdgeDecision;
  reviewedAt: number;
}

export interface GraphOverridesFile {
  version: 1;
  edges: Record<string, GraphEdgeOverride>;
}

export type GraphReviewStatus = 'pending' | 'confirm' | 'reject';

export interface GraphReviewItem {
  key: string;
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  fromType: string;
  toType: string;
  fromOrigin?: string;
  toOrigin?: string;
  type: GraphEdgeType;
  typeLabel: string;
  source: GraphEdgeSource;
  confidence: number;
  weight?: number;
  decision: GraphEdgeDecision | null;
  quote?: string;
}
