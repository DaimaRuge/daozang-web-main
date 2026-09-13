/**
 * 原书插图 URL 与文件名辅助（可进客户端）。
 * 磁盘路径与索引加载仍只在 lib/daozang-images.ts。
 *
 * 阅读块仍写站内 /api/daozang-images/...，方便校定解析；
 * 对象存储 key 固定为 daozang-images/<部>/<文件>，Vercel 上 API 再 302 到 CDN。
 */

export const DAOZANG_OBJECT_PREFIX = 'daozang-images';

export function daozangImageUrl(part: string, file: string): string {
  return `/api/daozang-images/${encodeURIComponent(part)}/${encodeURIComponent(file)}`;
}

/** 桶内稳定 key，重跑上传可覆盖同一对象 */
export function daozangObjectKey(part: string, file: string): string {
  return `${DAOZANG_OBJECT_PREFIX}/${part}/${file}`;
}

/** CDN 公开地址；未配置域名时退回站内 API */
export function daozangPublicUrl(part: string, file: string, mediaBase = ''): string {
  const base = mediaBase.replace(/\/+$/, '');
  if (!base) return daozangImageUrl(part, file);
  return `${base}/${DAOZANG_OBJECT_PREFIX}/${encodeURIComponent(part)}/${encodeURIComponent(file)}`;
}

/** 从阅读块 URL 还原部名与文件名（站内 API 或 CDN） */
export function parseDaozangImageUrl(url: string): { part: string; file: string } | null {
  const m =
    url.match(/\/api\/daozang-images\/([^/?#]+)\/([^/?#]+)/) ??
    url.match(/\/daozang-images\/([^/?#]+)\/([^/?#]+)/);
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
