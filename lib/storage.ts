/**
 * 对象存储访问层（服务端 only）。
 *
 * 走 S3 兼容协议对接 Cloudflare R2：出网免费，适合长期分发大量音频；
 * 同一个桶后续可直接被 Payload 的 S3 存储适配器复用。
 * 若改用 Vercel Blob，只需替换本文件实现，上层接口不变。
 */

import crypto from 'crypto';
import path from 'path';
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type MediaKind = 'audio' | 'image' | 'video';

export const UPLOAD_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.DZ_S3_ENDPOINT &&
    process.env.DZ_S3_ACCESS_KEY_ID &&
    process.env.DZ_S3_SECRET_ACCESS_KEY &&
    process.env.DZ_S3_BUCKET &&
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL,
  );
}

/** 校验浏览器回传的 key 确实是我们签发的分目录格式，防止任意覆盖桶内对象。 */
export function isOwnedStorageKey(kind: MediaKind, key: string): boolean {
  if (!key || key.includes('..') || key.includes('\\') || key.startsWith('/') || key.includes('//')) {
    return false;
  }
  return new RegExp(`^${kind}/\\d{4}/\\d{2}/[^/]+$`).test(key);
}

/**
 * 构造对象 key。
 *
 * 按「类型/年/月」分目录是为了让桶在资产上万后仍可浏览；
 * 追加随机后缀是因为运营会重复上传同名文件（如多次导出的 cover.jpg），
 * 直接用原名会静默覆盖已在线的资产。
 */
export function buildStorageKey(kind: MediaKind, filename: string, at: Date = new Date()): string {
  const ext = path.extname(filename).toLowerCase();
  const base = path
    .basename(filename, ext)
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')   // 路径分隔符、空格等一律折成连字符
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'asset';
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, '0');
  const suffix = crypto.randomBytes(4).toString('hex');
  return `${kind}/${year}/${month}/${base}-${suffix}${ext}`;
}

function getClient(): S3Client {
  const endpoint = process.env.DZ_S3_ENDPOINT;
  const accessKeyId = process.env.DZ_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.DZ_S3_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('对象存储未配置：需要 DZ_S3_ENDPOINT / DZ_S3_ACCESS_KEY_ID / DZ_S3_SECRET_ACCESS_KEY');
  }
  // R2 与本地 MinIO 都需要 path-style；虚拟主机样式会拼错 endpoint。
  const forcePathStyle =
    process.env.DZ_S3_FORCE_PATH_STYLE === '1' ||
    process.env.DZ_S3_FORCE_PATH_STYLE === 'true' ||
    /r2\.cloudflarestorage\.com/i.test(endpoint) ||
    /localhost|127\.0\.0\.1/i.test(endpoint);

  return new S3Client({
    region: process.env.DZ_S3_REGION ?? 'auto',  // R2 固定用 auto
    endpoint,
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucket(): string {
  const bucket = process.env.DZ_S3_BUCKET;
  if (!bucket) throw new Error('对象存储未配置：缺少 DZ_S3_BUCKET');
  return bucket;
}

/** 拼公开访问地址（桶前面挂 CDN 域名） */
export function publicUrl(key: string): string {
  const base = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? '').replace(/\/+$/, '');
  if (!base) throw new Error('对象存储未配置：缺少 NEXT_PUBLIC_MEDIA_BASE_URL');
  return `${base}/${key}`;
}

/** 服务端直接上传，返回公开地址。适合脚本与小文件 */
export async function uploadObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  await getClient().send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: body,
    ContentType: contentType,
    // 媒体资产内容不可变（key 带随机后缀），可长期强缓存
    CacheControl: UPLOAD_CACHE_CONTROL,
  }));
  return publicUrl(key);
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: getBucket(), Key: key }));
    return true;
  } catch (err) {
    const status =
      err && typeof err === 'object' && '$metadata' in err
        ? (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
        : undefined;
    const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
    if (status === 404 || name === 'NotFound' || name === 'NotFoundError') return false;
    throw err;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}

/**
 * 生成预签名上传地址，供浏览器直传。
 * 后台上传大体积音视频必须走这条路：让文件经过 serverless 函数中转
 * 会撞上请求体大小与执行时长限制。
 */
export async function createUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 900,
): Promise<string> {
  // 预签名 Put 也带上 CacheControl，与 uploadObject 一致；
  // 浏览器直传时须原样附带该头，否则签名对不上。
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
    CacheControl: UPLOAD_CACHE_CONTROL,
  });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
}
