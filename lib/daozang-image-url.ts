/**
 * 原书插图 URL 与文件名辅助（可进客户端）。
 * 磁盘路径与索引加载仍只在 lib/daozang-images.ts。
 *
 * 原扫描 jpg 已入库 public/daozang-images/，阅读页走静态路径；
 * 复原色（png/webp）仍走 /api/daozang-images/...，本机读盘或 302 到 CDN。
 */

export const DAOZANG_OBJECT_PREFIX = 'daozang-images';

export function daozangImageUrl(part: string, file: string): string {
  const encoded = `${encodeURIComponent(part)}/${encodeURIComponent(file)}`;
  if (/\.(jpe?g)$/i.test(file)) return `/daozang-images/${encoded}`;
  return `/api/daozang-images/${encoded}`;
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
  return file.replace(/\.(ink|cinnabar)\.(png|webp)$/i, '').replace(/\.(jpe?g|png|webp)$/i, '');
}
