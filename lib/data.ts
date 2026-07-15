import fs from 'fs';
import path from 'path';
import { queryVariants } from './zh-convert';

export interface DaozangEntry {
  id: string;
  title: string;
  collection: string;
  category: string;
  subcategory: string;
  author?: string;
  filename: string;
  size: number;
  lineCount: number;
  preview: string;
}

export interface CategoryInfo {
  name: string;
  count: number;
  subcategories: string[];
}

export interface DaozangIndex {
  version: number;
  buildTime: string;
  totalEntries: number;
  categories: CategoryInfo[];
  entries: DaozangEntry[];
}

let _index: DaozangIndex | null = null;

export function getIndex(): DaozangIndex {
  if (!_index) {
    // 优先读 public/data（生产环境随构建产物分发），回退 data/（本地开发）
    let indexPath = path.resolve(process.cwd(), 'public/data/index.json');
    if (!fs.existsSync(indexPath)) {
      indexPath = path.resolve(process.cwd(), 'data/index.json');
    }
    _index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  }
  return _index!;
}

/**
 * 读取一部典籍的原始全文（不可变底稿）。
 * 为什么放在数据层而不是 API 路由里：阅读页已改为服务端组件直接渲染正文
 * （SEO 需要服务端可读取正文），页面与 /api/entry 必须共享同一读取逻辑。
 */
export function getContentById(id: string): string {
  const contentPath = path.resolve(process.cwd(), 'public/data/content', `${id}.json`);
  try {
    const raw = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));
    return raw.content as string;
  } catch {
    return '';
  }
}

export function getEntryById(id: string): DaozangEntry | undefined {
  return getIndex().entries.find(e => e.id === id);
}

export function searchEntries(query: string, page: number = 1, pageSize: number = 20): { results: DaozangEntry[]; total: number } {
  const index = getIndex();
  // 索引数据为繁体，简体查询自动扩展繁体变体后按并集匹配
  const variants = queryVariants(query).map(v => v.toLowerCase());

  const results = index.entries.filter(e =>
    variants.some(
      q =>
        e.title.toLowerCase().includes(q) ||
        (e.author && e.author.toLowerCase().includes(q)) ||
        e.preview.toLowerCase().includes(q),
    ),
  );

  return {
    results: results.slice((page - 1) * pageSize, page * pageSize),
    total: results.length,
  };
}

export function getEntriesByCategory(category: string, subcategory?: string, page: number = 1, pageSize: number = 30): { results: DaozangEntry[]; total: number } {
  const filtered = filterEntriesByCategory(category, subcategory);
  return {
    results: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length,
  };
}

/** 部类下全部典籍（供目录探索页客户端筛选，不做服务端分页） */
export function filterEntriesByCategory(category: string, subcategory?: string): DaozangEntry[] {
  const index = getIndex();
  let filtered = index.entries.filter(e => e.category === category);
  if (subcategory) {
    filtered = filtered.filter(e => e.subcategory === subcategory);
  }
  return filtered;
}

export function getAdjacentEntries(id: string): { prev?: DaozangEntry; next?: DaozangEntry } {
  const entries = getIndex().entries;
  const idx = entries.findIndex(e => e.id === id);
  return {
    prev: idx > 0 ? entries[idx - 1] : undefined,
    next: idx < entries.length - 1 ? entries[idx + 1] : undefined,
  };
}
