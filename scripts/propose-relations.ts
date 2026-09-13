/**
 * 第三期：抽出待审关系，写入 data/graph/proposals.json。
 *
 * 默认走规则（策展↔自动的强共现 → related_to，confidence 0.55）。
 * 若配置了 DZ_LLM_API_KEY，可在后续把同一批候选交给模型复核；
 * 没有密钥时不得伪造 source=llm。
 *
 * 不改原文，不重写 graph.json.gz。
 */
import * as fs from 'fs';
import * as path from 'path';
import { loadKnowledgeGraph } from '../lib/graph/load';
import { extractRelationProposals, type GraphProposalsFile } from '../lib/graph/proposals';

const OUT = path.resolve(__dirname, '../data/graph/proposals.json');

function main(): void {
  const graph = loadKnowledgeGraph();
  if (!graph) {
    console.error('图谱产物不存在，请先 npm run build-graph');
    process.exit(1);
  }
  const edges = extractRelationProposals(graph, 60);
  const file: GraphProposalsFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    method: 'cooccur-curated-auto-v1',
    edges,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(file, null, 2), 'utf-8');
  console.log(`写出 ${edges.length} 条待审关系 → ${path.relative(process.cwd(), OUT)}`);
}

main();
