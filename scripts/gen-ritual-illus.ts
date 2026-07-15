/**
 * 科仪示意图批量生成。
 *
 * 流程：解析典籍 → 定位科仪锚点块 → mmx 文本模型解读并生成示意图 prompt
 * → libtv 文生图 → 落盘 public/images/ritual/ + data/ritual-illustrations.json
 *
 * 运行：npx tsx scripts/gen-ritual-illus.ts [bookId] [--max=3]
 * 前置：libtv project use 已绑定画布；mmx 已登录。
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getContentById, getEntryById } from '../lib/data';
import { parseText } from '../lib/text-parser';
import { overrideKey } from '../lib/parser-overrides';
import { RitualIllustrationsFile } from '../lib/ritual-illustrations';

const MANIFEST = path.resolve(__dirname, '../data/ritual-illustrations.json');
const OUT_DIR = path.resolve(__dirname, '../public/images/ritual');

/** 科仪锚点：法事引导、科仪指示语、咒曰前的结构块 */
function isRitualAnchor(content: string, type: string): boolean {
  if (/法事如式|科儀如式|舉法事/.test(content)) return true;
  if (type === 'annotation' && /如法|如式|存念/.test(content)) return true;
  if (type === 'subheading' && /儀$|科$|法$/.test(content) && content.length <= 12) return true;
  return false;
}

async function llmPrompt(anchor: string, bookTitle: string, context: string): Promise<string> {
  const sys = `你是道教科仪研究助手。根据原文片段，生成一段英文文生图提示词（80-120词），要求：
- 绘制科仪示意图（schematic diagram），非写实照片
- 传统中国水墨线描风格（ink line drawing），宣纸底色
- 标明法坛、香炉、灯盏、星图、道士方位等关键元素
- 俯视图或流程图布局，清晰标注步骤
- 不要出现现代元素、不要文字水印、no text in image`;

  const user = `典籍：《${bookTitle}》
锚点原文：${anchor}
上下文：${context.slice(0, 300)}

请只输出英文提示词，不要其他解释。`;

  const cmd = [
    'mmx', 'text', 'chat',
    '--non-interactive', '--quiet', '--output', 'json',
    `--system`, JSON.stringify(sys),
    `--message`, `user:${user}`,
    '--max-tokens', '300',
  ].join(' ');

  const raw = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  const data = JSON.parse(raw) as { content?: string; reply?: string };
  return (data.content ?? data.reply ?? raw).trim().replace(/^["']|["']$/g, '');
}

function libtvGenerate(nodeName: string, prompt: string): string {
  const safeName = nodeName.replace(/[^\w\u4e00-\u9fff-]/g, '-').slice(0, 40);
  const outJson = path.resolve(__dirname, `out-ritual-${safeName}.json`);

  execSync(
    `libtv node --x 0 --y 0 create "${safeName}" -t image -s "model=Seedream 5.0 Pro" -s "ratio=4:3" -s "quality=2K" --prompt ${JSON.stringify(prompt)} --run`,
    { encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024, stdio: ['pipe', 'pipe', 'inherit'] },
  );

  // libtv 输出可能在 stdout，重定向到文件更可靠——用 --run 后再查询节点
  try {
    const nodeOut = execSync(`libtv node "${safeName}"`, { encoding: 'utf-8' });
    fs.writeFileSync(outJson, nodeOut);
    const match = nodeOut.match(/https:\/\/[^\s"]+\.(png|jpe?g|webp)/);
    if (!match) throw new Error('no url in node output');
    return match[0];
  } catch {
    throw new Error(`libtv generate failed for ${safeName}`);
  }
}

async function main() {
  const bookId = process.argv[2] ?? 'e335df6e8cd9ba5f';
  const maxArg = process.argv.find(a => a.startsWith('--max='));
  const max = maxArg ? parseInt(maxArg.split('=')[1], 10) : 2;

  const entry = getEntryById(bookId);
  if (!entry) throw new Error(`book not found: ${bookId}`);

  const content = getContentById(bookId);
  const parsed = parseText(content, bookId, entry.title);

  const anchors = parsed.blocks.filter(b => isRitualAnchor(b.content, b.type)).slice(0, max);
  if (anchors.length === 0) {
    console.log('No ritual anchors found.');
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let manifest: RitualIllustrationsFile = {};
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));
  } catch { /* empty */ }

  manifest[bookId] ??= {};

  for (const block of anchors) {
    const key = overrideKey(block);
    if (manifest[bookId][key]) {
      console.log(`[skip] ${key}`);
      continue;
    }

    const idx = parsed.blocks.indexOf(block);
    const context = [
      parsed.blocks[idx - 1]?.content,
      block.content,
      parsed.blocks[idx + 1]?.content,
    ].filter(Boolean).join(' / ');

    console.log(`[llm] prompt for: ${block.content.slice(0, 20)}…`);
    const imgPrompt = await llmPrompt(block.content, entry.title, context);
    console.log(`[libtv] generating…`);

    const url = libtvGenerate(`ritual-${bookId.slice(0, 8)}-${key.slice(0, 8)}`, imgPrompt);

    const ext = path.extname(new URL(url).pathname) || '.png';
    const localName = `${bookId}-${key.replace(/:/g, '-')}${ext}`;
    const localPath = path.join(OUT_DIR, localName);

    execSync(`curl -sL "${url}" -o "${localPath}"`, { stdio: 'inherit' });

    manifest[bookId][key] = {
      image: `/images/ritual/${localName}`,
      caption: `《${entry.title}》「${block.content.slice(0, 16)}」科仪示意图（AI 生成，仅供参考，非史料）`,
      position: 'after',
      aiGenerated: true,
    };

    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), 'utf-8');
    console.log(`[done] ${localPath}`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
