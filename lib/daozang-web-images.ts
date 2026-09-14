/**
 * 网页压缩复原清单。高清 PNG 母版只留本机，供日后付费下载；
 * 线上只认这里登记过的 .cinnabar.webp。
 */
import fs from 'fs';
import path from 'path';
import { restoredStem } from './daozang-image-url';

/** 母版是 1024 边透明 PNG；网页按阅读区缩放，不必保留那么大。 */
export const WEB_CINNABAR_LONG_EDGE = 384;
export const WEB_CINNABAR_QUALITY = 45;
export const WEB_CINNABAR_ALPHA_QUALITY = 50;
export const WEB_CINNABAR_EFFORT = 6;

export interface DaozangWebImageManifest {
  version: 1;
  generatedAt: string;
  longEdge: number;
  stats: { webCinnabar: number };
  items: { part: string; file: string }[];
}

const MANIFEST_PATH = path.join(process.cwd(), 'data', 'daozang-web-images.json');

let cache: Set<string> | null = null;

export function webCinnabarFile(originalFile: string): string {
  return `${restoredStem(originalFile)}.cinnabar.webp`;
}

export function webImageKey(part: string, originalFile: string): string {
  return `${part}/${restoredStem(originalFile)}`;
}

export function loadWebCinnabarKeys(): Set<string> {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as DaozangWebImageManifest;
    cache = new Set(raw.items.map(i => webImageKey(i.part, i.file)));
    return cache;
  } catch {
    cache = new Set();
    return cache;
  }
}

export function hasWebCinnabar(part: string, originalFile: string): boolean {
  return loadWebCinnabarKeys().has(webImageKey(part, originalFile));
}
