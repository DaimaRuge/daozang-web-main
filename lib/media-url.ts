/**
 * 站内媒体路径 → 实际访问地址。
 *
 * 媒体已迁出 Git 存入对象存储，但代码里仍以 /audio/xx.mp3 这类站内路径书写：
 * 一是改动面小，二是未配置 CDN 时能自动回退到 public/ 下的本地文件，
 * 让没有存储凭据的协作者也能把项目跑起来。
 * 本文件会被客户端组件引用，因此只能读 NEXT_PUBLIC_ 前缀的变量。
 */

/** 可测试的纯函数版本，base 由调用方注入 */
export function resolveMediaUrl(assetPath: string, base: string): string {
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  const trimmedBase = base.replace(/\/+$/, '');
  if (!trimmedBase) return assetPath;
  const suffix = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
  return `${trimmedBase}${suffix}`;
}

export function mediaUrl(assetPath: string): string {
  return resolveMediaUrl(assetPath, process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? '');
}
