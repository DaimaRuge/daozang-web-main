/**
 * 将 data/illustration-candidates.json 幂等导入 illustration_candidates。
 * 重复运行会更新线索字段，不覆盖人工 state。
 */

import { closePool } from '../lib/pg';
import { loadIllustrationCatalog } from '../lib/illustrations/catalog';
import { countImportedCandidates, upsertIllustrationCandidates } from '../lib/illustrations/persist';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[import:illustrations] 需要 DATABASE_URL');
    process.exit(1);
  }
  const catalog = loadIllustrationCatalog();
  if (!catalog.candidates.length) {
    console.error('[import:illustrations] JSON 为空，请先 npm run scan:illustrations');
    process.exit(1);
  }
  const written = await upsertIllustrationCandidates(catalog.candidates);
  const total = await countImportedCandidates();
  console.log(
    `[import:illustrations] 写入 ${written} 行（JSON ${catalog.candidates.length}），表内现有 ${total} 条`,
  );
}

main()
  .then(() => closePool())
  .catch(async err => {
    console.error('[import:illustrations] 失败：', err);
    await closePool();
    process.exit(1);
  });
