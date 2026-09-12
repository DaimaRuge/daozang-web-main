/**
 * 全库扫描缺图候选，幂等覆盖写入 data/illustration-candidates.json。
 *
 * 原文只读。单本解析失败记入 skipped，不中断其余书。
 * 运行：npm run scan:illustrations
 */

import fs from 'fs';
import path from 'path';
import { getContentById, getIndex } from '../lib/data';
import { parseText, PARSER_VERSION } from '../lib/text-parser';
import { detectIllustrationCandidates } from '../lib/illustrations/detect-candidates';
import type { IllustrationCandidate, IllustrationCatalog } from '../lib/illustrations/candidates';
import { catalogPath } from '../lib/illustrations/catalog';

function main(): void {
  const index = getIndex();
  const candidates: IllustrationCandidate[] = [];
  let skipped = 0;

  for (let i = 0; i < index.entries.length; i++) {
    const entry = index.entries[i];
    try {
      const source = getContentById(entry.id);
      if (!source) {
        skipped += 1;
        continue;
      }
      const parsed = parseText(source, entry.id, entry.title);
      candidates.push(
        ...detectIllustrationCandidates(parsed, {
          id: entry.id,
          title: entry.title,
          collection: entry.collection,
          category: entry.category,
          subcategory: entry.subcategory,
          author: entry.author,
        }),
      );
    } catch (err) {
      skipped += 1;
      console.error(`[scan:illustrations] skip ${entry.id} ${entry.title}:`, err);
    }
    if ((i + 1) % 100 === 0 || i + 1 === index.entries.length) {
      console.log(`[scan:illustrations] ${i + 1}/${index.entries.length} 书，候选 ${candidates.length}，跳过 ${skipped}`);
    }
  }

  const catalog: IllustrationCatalog = {
    version: 1,
    scannedAt: new Date().toISOString(),
    parser: PARSER_VERSION,
    stats: {
      booksScanned: index.entries.length,
      candidates: candidates.length,
      skipped,
    },
    candidates,
  };

  const out = catalogPath();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(catalog, null, 2), 'utf-8');
  console.log(`[scan:illustrations] 写入 ${out}`);
}

main();
