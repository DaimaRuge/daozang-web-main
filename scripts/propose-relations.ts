/**
 * 第三期：抽出待审关系，写入 data/graph/proposals.json。
 *
 * 默认走规则（策展↔自动的强共现 → related_to）。
 * 若配置了 DZ_LLM_API_KEY，把同一批候选交给模型复核；
 * 接受的标 source=llm（置信度仍低于待考线，必须再人工审）；
 * 没有密钥或复核失败时不得伪造 source=llm。
 *
 * 不改原文，不重写 graph.json.gz。
 */
import * as fs from 'fs';
import * as path from 'path';
import { getProvider } from '../lib/agent/provider';
import { loadKnowledgeGraph } from '../lib/graph/load';
import {
  extractRelationProposals,
  reviewProposalsWithLlm,
  type GraphProposalsFile,
} from '../lib/graph/proposals';

const OUT = path.resolve(__dirname, '../data/graph/proposals.json');

async function main(): Promise<void> {
  const graph = loadKnowledgeGraph();
  if (!graph) {
    console.error('图谱产物不存在，请先 npm run build-graph');
    process.exit(1);
  }
  let edges = extractRelationProposals(graph, 60);
  let method = 'cooccur-curated-auto-v1';
  const provider = getProvider('fast');
  if (provider.isConfigured()) {
    try {
      edges = await reviewProposalsWithLlm(edges, graph.nodes, prompt =>
        provider.chat([{ role: 'user', content: prompt }], { temperature: 0, maxTokens: 800 }),
      );
      method = 'cooccur-curated-auto-v1+llm';
      console.log('已用模型复核提案（接受的标为 llm，仍待人工审）');
    } catch (err) {
      console.warn('模型复核失败，保留规则抽取：', err instanceof Error ? err.message : err);
    }
  }

  const file: GraphProposalsFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    method,
    edges,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(file, null, 2), 'utf-8');
  console.log(`写出 ${edges.length} 条待审关系 → ${path.relative(process.cwd(), OUT)}`);
}

void main();
