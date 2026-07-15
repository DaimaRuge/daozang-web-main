import fs from 'fs';
import path from 'path';
import { getIndex, DaozangEntry } from './data';
import { queryVariants } from './zh-convert';

/**
 * 全文检索（服务端，v1：内存线性扫描）。
 *
 * 为什么选择「一次加载 + 内存扫描」而不是倒排索引：
 * 1. 语料约 97MB、1504 个文件，加载后内存扫描一次查询仅需一两百毫秒，
 *    对当前公益站点的访问量完全够用；
 * 2. 倒排索引/向量检索需要构建产物翻倍与额外服务，属于路线图中期项；
 * 3. 本模块对外只暴露 searchFullText 接口 —— 搜索实现与调用方解耦，
 *    未来替换为索引服务时（接口不变）调用方零改动。
 *
 * 注意：仅服务端使用（依赖 fs），冷启动首次查询会有一次性加载成本。
 */

export interface FullTextHit {
  entry: Pick<DaozangEntry, 'id' | 'title' | 'category' | 'subcategory' | 'author'>;
  /** 命中处上下文摘要（关键词前后各约 40 字） */
  snippet: string;
  /** 该书内命中总次数 */
  matchCount: number;
  /** 实际命中的词形（简体查询命中繁体语料时与输入不同，前端据此高亮） */
  matchedTerm: string;
}

interface CorpusDoc {
  entry: DaozangEntry;
  text: string;
}

let _corpus: CorpusDoc[] | null = null;

/** 语料懒加载并缓存于模块级内存（每个服务进程仅一次） */
function loadCorpus(): CorpusDoc[] {
  if (_corpus) return _corpus;
  const contentDir = path.resolve(process.cwd(), 'public/data/content');
  const docs: CorpusDoc[] = [];
  for (const entry of getIndex().entries) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(contentDir, `${entry.id}.json`), 'utf-8'));
      docs.push({ entry, text: raw.content as string });
    } catch {
      // 个别缺失文件不阻断整体检索
    }
  }
  _corpus = docs;
  return docs;
}

/** 从命中位置截取上下文摘要，规整空白以便单行展示 */
function makeSnippet(text: string, pos: number, queryLen: number): string {
  const start = Math.max(0, pos - 40);
  const end = Math.min(text.length, pos + queryLen + 40);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end).replace(/[\s\u3000]+/g, ' ').trim() + suffix;
}

export function searchFullText(
  query: string,
  page = 1,
  pageSize = 20,
): { results: FullTextHit[]; total: number } {
  const q = query.trim();
  if (!q) return { results: [], total: 0 };

  // 简体查询自动扩展繁体变体（语料为繁体），按变体并集检索
  const variants = queryVariants(q);

  const hits: FullTextHit[] = [];
  for (const doc of loadCorpus()) {
    // 找到第一个命中的词形；同一部书按首个命中变体统计
    let matched = '';
    let firstPos = -1;
    for (const v of variants) {
      const pos = doc.text.indexOf(v);
      if (pos !== -1 && (firstPos === -1 || pos < firstPos)) {
        matched = v;
        firstPos = pos;
      }
    }
    if (firstPos === -1) continue;

    // 统计命中次数（用于排序：命中越多相关性越高）
    let count = 0;
    let idx = firstPos;
    while (idx !== -1 && count < 100) {
      count++;
      idx = doc.text.indexOf(matched, idx + matched.length);
    }

    hits.push({
      entry: {
        id: doc.entry.id,
        title: doc.entry.title,
        category: doc.entry.category,
        subcategory: doc.entry.subcategory,
        author: doc.entry.author,
      },
      snippet: makeSnippet(doc.text, firstPos, matched.length),
      matchCount: count,
      matchedTerm: matched,
    });
  }

  // 标题命中优先（任一变体），其次按书内命中次数
  hits.sort((a, b) => {
    const aTitle = variants.some(v => a.entry.title.includes(v)) ? 1 : 0;
    const bTitle = variants.some(v => b.entry.title.includes(v)) ? 1 : 0;
    if (aTitle !== bTitle) return bTitle - aTitle;
    return b.matchCount - a.matchCount;
  });

  return {
    results: hits.slice((page - 1) * pageSize, page * pageSize),
    total: hits.length,
  };
}
