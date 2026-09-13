/**
 * 概念图目录筛选：简体「玉皇」要能落到繁体「玉皇」卡片上。
 * 变体展开交给调用方注入（生产用 queryVariants），便于单测不绑 OpenCC。
 */

export function atlasEntryMatches(
  label: string,
  filter: string,
  variants: (text: string) => string[] = s => [s],
): boolean {
  const q = filter.trim();
  if (!q) return true;
  const needles = variants(q).map(s => s.trim()).filter(Boolean);
  const haystacks = variants(label).map(s => s.trim()).filter(Boolean);
  for (const n of needles) {
    for (const h of haystacks) {
      if (h.includes(n) || n.includes(h)) return true;
    }
  }
  return false;
}
