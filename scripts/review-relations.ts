/**
 * 把共现待考边按 review-policy 写成 overrides。
 *
 * 文献近邻不写校正（图上仍标待考，但不进队列）。
 * 已有人工键不覆盖。不改原文、不重写 graph.json.gz。
 */
import * as fs from 'fs';
import * as path from 'path';
import { loadKnowledgeGraph } from '../lib/graph/load';
import { applyGraphProposals, loadGraphProposals } from '../lib/graph/proposals';
import {
  edgeOverrideKeyOf,
  loadGraphOverrides,
  resetGraphOverridesCache,
} from '../lib/graph/overrides';
import { LOW_CONFIDENCE } from '../lib/content-schema';
import { decideCooccurEdge } from '../lib/graph/review-policy';

const OUT = path.resolve(__dirname, '../data/graph/overrides.json');

function main(): void {
  const raw = loadKnowledgeGraph();
  if (!raw) {
    console.error('图谱产物不存在，请先 npm run build-graph');
    process.exit(1);
  }
  const graph = applyGraphProposals(raw, loadGraphProposals());
  const nodeById = new Map(graph.nodes.map(n => [n.id, n]));
  const file = loadGraphOverrides();
  const reviewedAt = Date.now();
  let confirm = 0;
  let reject = 0;
  let skip = 0;

  for (const edge of graph.edges) {
    if (edge.source !== 'cooccur') continue;
    if (edge.confidence >= LOW_CONFIDENCE) continue;
    const key = edgeOverrideKeyOf(edge);
    if (file.edges[key]) {
      skip++;
      continue;
    }
    const a = nodeById.get(edge.from);
    const b = nodeById.get(edge.to);
    if (!a || !b) continue;
    const decision = decideCooccurEdge(edge, a, b);
    if (decision === 'defer') continue;
    file.edges[key] = { decision, reviewedAt };
    if (decision === 'confirm') confirm++;
    else reject++;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n', 'utf-8');
  resetGraphOverridesCache();
  console.log(`共现裁定 确认 ${confirm}、否决 ${reject}、已有校正跳过 ${skip} → ${path.relative(process.cwd(), OUT)}`);
}

main();
