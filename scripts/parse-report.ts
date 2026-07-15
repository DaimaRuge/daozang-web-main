/**
 * 全库解析质量报告。
 *
 * 为什么需要这个脚本：解析器的规则是从抽样文本归纳的，必须在全部 1500+
 * 部经文上跑批验证，用数据（而不是感觉）发现误判模式，驱动规则迭代。
 * 报告输出到 docs/parse-report.md，作为每个 parser 版本的质量基线，
 * 规则改动前后对比该报告即可评估回归。
 *
 * 运行：npx tsx scripts/parse-report.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseText, PARSER_VERSION } from '../lib/text-parser';
import { ContentBlockType, LOW_CONFIDENCE } from '../lib/content-schema';

const INDEX_PATH = path.resolve(__dirname, '../public/data/index.json');
const CONTENT_DIR = path.resolve(__dirname, '../public/data/content');
const REPORT_PATH = path.resolve(__dirname, '../docs/parse-report.md');

interface Entry { id: string; title: string; }

function main() {
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
  const entries: Entry[] = index.entries;

  const typeCount = new Map<ContentBlockType, number>();
  const lowConfByType = new Map<ContentBlockType, number>();
  /** 低置信度块的内容样本：按内容前缀聚类，找出高频误判模式 */
  const lowConfSamples = new Map<string, number>();
  const bookStats: Array<{ title: string; id: string; total: number; lowConf: number }> = [];

  let totalBlocks = 0;
  let totalLowConf = 0;
  let parsedBooks = 0;

  for (const entry of entries) {
    const contentPath = path.join(CONTENT_DIR, `${entry.id}.json`);
    if (!fs.existsSync(contentPath)) continue;
    const { content } = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));
    const parsed = parseText(content, entry.id, entry.title);
    parsedBooks++;

    totalBlocks += parsed.stats.totalBlocks;
    totalLowConf += parsed.stats.lowConfidenceBlocks;

    for (const b of parsed.blocks) {
      typeCount.set(b.type, (typeCount.get(b.type) ?? 0) + 1);
      if (b.confidence < LOW_CONFIDENCE) {
        lowConfByType.set(b.type, (lowConfByType.get(b.type) ?? 0) + 1);
        // 截取前 12 字作为聚类键，统计高频低置信度内容形态
        const key = `${b.type}: ${b.content.slice(0, 12)}`;
        lowConfSamples.set(key, (lowConfSamples.get(key) ?? 0) + 1);
      }
    }

    bookStats.push({
      title: entry.title,
      id: entry.id,
      total: parsed.stats.totalBlocks,
      lowConf: parsed.stats.lowConfidenceBlocks,
    });
  }

  const fmt = (n: number) => n.toLocaleString('zh-CN');
  const pct = (a: number, b: number) => (b > 0 ? ((a / b) * 100).toFixed(2) + '%' : '-');

  const worstBooks = bookStats
    .filter(b => b.total > 0)
    .sort((a, b) => b.lowConf / b.total - a.lowConf / a.total)
    .slice(0, 20);

  const topSamples = Array.from(lowConfSamples.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40);

  const lines: string[] = [
    '# 解析质量报告',
    '',
    `- 生成时间：${new Date().toISOString()}`,
    `- 解析器版本：${PARSER_VERSION}`,
    `- 解析典籍数：${fmt(parsedBooks)} / ${fmt(entries.length)}`,
    `- 总内容块：${fmt(totalBlocks)}`,
    `- 低置信度块：${fmt(totalLowConf)}（${pct(totalLowConf, totalBlocks)}）`,
    '',
    '## 块类型分布',
    '',
    '| 类型 | 数量 | 其中低置信度 |',
    '|---|---|---|',
    ...Array.from(typeCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `| ${t} | ${fmt(n)} | ${fmt(lowConfByType.get(t) ?? 0)} |`),
    '',
    '## 低置信度内容高频形态（前 40，供规则迭代参考）',
    '',
    '| 形态（类型: 内容前缀） | 出现次数 |',
    '|---|---|',
    ...topSamples.map(([k, n]) => `| ${k.replace(/\|/g, '\\|')} | ${fmt(n)} |`),
    '',
    '## 低置信度占比最高的典籍（前 20）',
    '',
    '| 典籍 | 低置信度/总块数 | 占比 |',
    '|---|---|---|',
    ...worstBooks.map(b => `| ${b.title} | ${fmt(b.lowConf)}/${fmt(b.total)} | ${pct(b.lowConf, b.total)} |`),
    '',
  ];

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf-8');

  console.log(`解析 ${parsedBooks} 部，共 ${fmt(totalBlocks)} 块，低置信度 ${fmt(totalLowConf)}（${pct(totalLowConf, totalBlocks)}）`);
  console.log(`报告已写入 ${path.relative(process.cwd(), REPORT_PATH)}`);
  console.log('\n低置信度高频形态（前 15）：');
  for (const [k, n] of topSamples.slice(0, 15)) console.log(`  ${n}× ${k}`);
}

main();
