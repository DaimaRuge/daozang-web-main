/**
 * 插图线索 → 类型。多关键词时印优先于符、掌、图，
 * 避免「印圖」被当成版画而不是印章。
 */

import type { IllustrationKind } from './candidates';

export function kindFromClue(clue: string): IllustrationKind {
  if (/印/.test(clue)) return 'seal';
  if (/符/.test(clue)) return 'talisman';
  if (/掌/.test(clue)) return 'palm';
  if (/[圖图]/.test(clue)) return 'plate';
  return 'unknown';
}

export function kindLabel(kind: IllustrationKind): string {
  switch (kind) {
    case 'seal':
      return '印章';
    case 'talisman':
      return '符箓';
    case 'palm':
      return '掌诀';
    case 'plate':
      return '图版';
    default:
      return '插图';
  }
}
