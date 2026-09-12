/**
 * 原书插图 URL 与文件名辅助（可进客户端）。
 * 磁盘路径与索引加载仍只在 lib/daozang-images.ts。
 */

export function daozangImageUrl(part: string, file: string): string {
  return `/api/daozang-images/${encodeURIComponent(part)}/${encodeURIComponent(file)}`;
}

/** 从阅读块 URL 还原部名与文件名 */
export function parseDaozangImageUrl(url: string): { part: string; file: string } | null {
  const m = url.match(/\/api\/daozang-images\/([^/?#]+)\/([^/?#]+)/);
  if (!m) return null;
  try {
    return { part: decodeURIComponent(m[1]), file: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

/** 去掉原扩展以及 .ink / .cinnabar 变体后缀 */
export function restoredStem(file: string): string {
  return file.replace(/\.(ink|cinnabar)\.png$/i, '').replace(/\.(jpe?g|png|webp)$/i, '');
}
