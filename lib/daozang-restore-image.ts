/**
 * 把低清扫描线稿做成阅读页可用的高清资产：
 * - JPG：白底不透明，体积小，但会露出白块、细线有压缩痕
 * - PNG：宣纸色抠成透明，符墨叠在站点背景上，无白框
 *
 * JPG 本身没有 alpha，透明只能走 PNG。
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export interface RestoreOutputs {
  png: string;
  inkPng: string;
  cinnabarPng: string;
  jpg: string;
  width: number;
  height: number;
  hasAlpha: boolean;
}

export const CINNABAR_HEX = '#a83f39';

/** 原扫描里不少「.jpg」实为 PNG 或带告警的残图，告警不得中断复原。 */
const DECODE = { failOn: 'none' as const };

function openImage(input: Buffer | string) {
  return sharp(input, DECODE);
}

function longEdgeResize(longEdge: number) {
  return {
    width: longEdge,
    height: longEdge,
    fit: 'inside' as const,
    withoutEnlargement: false,
    kernel: 'lanczos3' as const,
  };
}

/** 纸色（边角采样）抠成透明，墨线压成近黑。 */
export async function toTransparentPng(
  input: Buffer,
  dest: string,
  longEdge = 1024,
): Promise<{ width: number; height: number }> {
  const { data, info } = await openImage(input)
    .resize(longEdgeResize(longEdge))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const at = (x: number, y: number) => (y * width + x) * 4;
  const corners = [
    at(2, 2),
    at(width - 3, 2),
    at(2, height - 3),
    at(width - 3, height - 3),
  ];
  let pr = 0;
  let pg = 0;
  let pb = 0;
  for (const i of corners) {
    pr += data[i];
    pg += data[i + 1];
    pb += data[i + 2];
  }
  pr /= 4;
  pg /= 4;
  pb /= 4;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const dist = Math.hypot(r - pr, g - pg, b - pb);
    let alpha: number;
    if (luma >= 205 || dist < 18) alpha = 0;
    else if (luma >= 150) alpha = Math.round(((205 - luma) / 55) * 255);
    else alpha = 255;
    if (alpha > 0) {
      const ink = Math.min(r, g, b);
      data[i] = ink;
      data[i + 1] = ink;
      data[i + 2] = ink;
    }
    data[i + 3] = alpha;
  }

  await sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 6 })
    .toFile(dest);
  return { width, height };
}

export async function toOpaqueJpeg(
  input: Buffer,
  dest: string,
  longEdge = 1024,
): Promise<{ width: number; height: number }> {
  const out = await openImage(input)
    .resize(longEdgeResize(longEdge))
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(dest);
  return { width: out.width, height: out.height };
}

function parseHex(color: string): { r: number; g: number; b: number } {
  const hex = color.replace('#', '');
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

/** 把墨线 PNG 染成朱砂，alpha 原样保留，几何不变。 */
export async function tintCinnabarPng(
  input: Buffer | string,
  dest: string,
  color = CINNABAR_HEX,
): Promise<{ width: number; height: number }> {
  const { data, info } = await openImage(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { r: cr, g: cg, b: cb } = parseHex(color);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i] = cr;
    data[i + 1] = cg;
    data[i + 2] = cb;
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 6 })
    .toFile(dest);
  return { width: info.width, height: info.height };
}

/** libtv 若原样返回扫描或几乎没放大，视为失败。 */
export async function isNoopRestore(original: Buffer, candidate: Buffer): Promise<boolean> {
  if (original.equals(candidate)) return true;
  try {
    const [a, b] = await Promise.all([openImage(original).metadata(), openImage(candidate).metadata()]);
    const longA = Math.max(a.width ?? 0, a.height ?? 0);
    const longB = Math.max(b.width ?? 0, b.height ?? 0);
    if (longA > 0 && longB / longA < 1.2) return true;
  } catch {
    return original.equals(candidate);
  }
  return false;
}

export async function writeRestoreVariants(
  input: Buffer,
  pngDest: string,
  jpgDest: string,
  longEdgeOrOpts: number | { longEdge?: number; cinnabar?: boolean } = 1024,
): Promise<RestoreOutputs> {
  const opts = typeof longEdgeOrOpts === 'number'
    ? { longEdge: longEdgeOrOpts, cinnabar: true }
    : { longEdge: longEdgeOrOpts.longEdge ?? 1024, cinnabar: longEdgeOrOpts.cinnabar ?? true };
  const inkDest = pngDest.replace(/\.png$/i, '.ink.png');
  const cinnabarDest = pngDest.replace(/\.png$/i, '.cinnabar.png');
  fs.mkdirSync(path.dirname(pngDest), { recursive: true });
  fs.mkdirSync(path.dirname(jpgDest), { recursive: true });
  const png = await toTransparentPng(input, inkDest, opts.longEdge);
  await toOpaqueJpeg(input, jpgDest, opts.longEdge);
  if (opts.cinnabar) {
    await tintCinnabarPng(inkDest, cinnabarDest);
    fs.copyFileSync(cinnabarDest, pngDest);
  } else {
    fs.copyFileSync(inkDest, pngDest);
  }
  return {
    png: pngDest,
    inkPng: inkDest,
    cinnabarPng: opts.cinnabar ? cinnabarDest : '',
    jpg: jpgDest,
    width: png.width,
    height: png.height,
    hasAlpha: true,
  };
}
