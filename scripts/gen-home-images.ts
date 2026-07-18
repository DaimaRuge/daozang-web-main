/**
 * 首页/搜索/问道 视觉升级配图批量生成（libtv CLI）。
 *
 * 运行：npx tsx scripts/gen-home-images.ts [--force]
 * 前置：libtv project use 已绑定画布。
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const OUT_DIR = path.resolve(__dirname, '../public/images/site');
const force = process.argv.includes('--force');

const STYLE =
  'Traditional Chinese ink wash painting, Song dynasty literati aesthetic, aged xuan rice paper texture, vast negative space, muted pine-green and faint vermilion accents, serene Taoist atmosphere, masterful brushwork, no text, no watermark, no modern elements, no photography';

interface Job {
  file: string;
  node: string;
  ratio: string;
  width: number;
  prompt: string;
}

const JOBS: Job[] = [
  {
    file: 'home-hero.jpg',
    node: 'web2-home-hero',
    ratio: '21:9',
    width: 2048,
    prompt: `Panoramic sacred Taoist mountain realm: towering mist-wreathed peaks, a small temple half-hidden among ancient pines on a cliff, two cranes gliding through cloud sea, waterfall thread in distance, dawn light, immense tranquil negative space in upper center for title. ${STYLE}`,
  },
  {
    file: 'sage.jpg',
    node: 'web2-sage-portrait',
    ratio: '1:1',
    width: 768,
    prompt: `Portrait of a venerable Taoist immortal sage: kind wise elderly face, long flowing white beard and hair, simple grey-green robe, holding a horsetail whisk, gentle compassionate half-smile, subtle aura of clouds behind, dignified and serene, upper body, centered. ${STYLE}`,
  },
  {
    file: 'ask-banner.jpg',
    node: 'web2-ask-banner',
    ratio: '16:9',
    width: 1600,
    prompt: `A Taoist immortal elder sitting cross-legged beneath an ancient twisted pine on a mountain ledge, red-crowned crane standing beside him, tea set on flat stone, sea of clouds below, full moon faint in sky, atmosphere of unhurried dialogue and deep wisdom. ${STYLE}`,
  },
  {
    file: 'clouds-band.jpg',
    node: 'web2-clouds-band',
    ratio: '21:9',
    width: 2048,
    prompt: `Extremely subtle and faint horizontal band of drifting ink clouds and mist, barely-there mountain silhouettes at bottom edge, 90 percent empty rice paper, ethereal, ultra minimal, for use as quiet background texture. ${STYLE}`,
  },
  {
    file: 'canon.jpg',
    node: 'web2-canon-library',
    ratio: '4:3',
    width: 1200,
    prompt: `Ancient Taoist scripture library interior: wooden shelves of scroll cases and stitched volumes, a low desk with open scroll, ink stone and brush, thin incense smoke rising in slanting light from lattice window, quiet scholarly reverence. ${STYLE}`,
  },
  {
    file: 'search-ink.jpg',
    node: 'web2-search-ink',
    ratio: '16:9',
    width: 1600,
    prompt: `A single elegant ink brushstroke sweeping across empty rice paper like a mountain ridge dissolving into mist, one tiny boat with fisherman below, vast emptiness, zen minimalism, contemplative silence. ${STYLE}`,
  },
];

function runLibtv(args: string[]): string {
  const r = spawnSync('libtv', args, { encoding: 'utf-8', maxBuffer: 30 * 1024 * 1024, shell: false });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status !== 0) throw new Error(out.trim() || `libtv exit ${r.status}`);
  return out;
}

function extractUrl(s: string): string | null {
  return s.match(/https:\/\/[^\s"\\]+\.(?:png|jpe?g|webp)/i)?.[0] ?? null;
}

function generate(job: Job, x: number): string {
  try {
    const out = runLibtv([
      'node', '--x', String(x), '--y', '2000', 'create', job.node,
      '-t', 'image',
      '-s', 'model=Seedream 5.0 Pro',
      '-s', `ratio=${job.ratio}`,
      '-s', 'quality=2K',
      '--prompt', job.prompt,
      '--run',
    ]);
    const url = extractUrl(out);
    if (url) return url;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/exist|已存在|already|唯一/i.test(msg)) throw e;
    console.log(`[retry-run] ${job.node}`);
    runLibtv(['node', job.node, '--prompt', job.prompt, '--run']);
  }
  const nodeOut = runLibtv(['node', job.node]);
  const url = extractUrl(nodeOut);
  if (!url) throw new Error(`no url for ${job.node}`);
  return url;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let x = 40000;
  let done = 0, skipped = 0, failed = 0;

  for (const job of JOBS) {
    const dest = path.join(OUT_DIR, job.file);
    if (!force && fs.existsSync(dest)) {
      console.log(`[skip] ${job.file}`);
      skipped++; x += 640;
      continue;
    }
    console.log(`[gen] ${job.file}`);
    try {
      const url = generate(job, x);
      const tmp = dest.replace(/\.jpg$/, '.tmp.png');
      const curl = spawnSync('curl', ['-fsSL', '-o', tmp, url], { stdio: 'inherit', shell: false });
      if (curl.status !== 0) throw new Error('curl failed');
      await sharp(tmp).resize({ width: job.width, withoutEnlargement: true }).jpeg({ quality: 84 }).toFile(dest);
      fs.unlinkSync(tmp);
      console.log(`[done] ${dest}`);
      done++; x += 640;
      await new Promise(r => setTimeout(r, 8000));
    } catch (e) {
      console.error(`[fail] ${job.file}`, e instanceof Error ? e.message : e);
      failed++;
      await new Promise(r => setTimeout(r, 15000));
    }
  }
  console.log(`[summary] done=${done} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exit(1); });
