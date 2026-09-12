/**
 * 缺图候选 JSON 目录（仅服务端读取）。
 * 扫描脚本的落盘结果；文件不存在时返回空目录，demo 仍可对当前书现场检测。
 */

import fs from 'fs';
import path from 'path';
import type { IllustrationCatalog, IllustrationCandidate } from './candidates';

const CATALOG_PATH = path.join(process.cwd(), 'data', 'illustration-candidates.json');

const EMPTY: IllustrationCatalog = {
  version: 1,
  scannedAt: '',
  parser: '',
  stats: { booksScanned: 0, candidates: 0, skipped: 0 },
  candidates: [],
};

export function catalogPath(): string {
  return CATALOG_PATH;
}

export function loadIllustrationCatalog(): IllustrationCatalog {
  try {
    return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8')) as IllustrationCatalog;
  } catch {
    return EMPTY;
  }
}

export interface CatalogBookOption {
  id: string;
  title: string;
  category: string;
  subcategory: string;
  count: number;
}

/** 书目下拉：至少一条非 title-tu 候选的书 */
export function catalogBooksWithSlots(candidates: IllustrationCandidate[]): CatalogBookOption[] {
  const map = new Map<string, CatalogBookOption>();
  for (const c of candidates) {
    if (c.signal === 'title-tu') continue;
    const prev = map.get(c.bookId);
    if (prev) {
      prev.count += 1;
      continue;
    }
    map.set(c.bookId, {
      id: c.bookId,
      title: c.title,
      category: c.category,
      subcategory: c.subcategory,
      count: 1,
    });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, 'zh'));
}
