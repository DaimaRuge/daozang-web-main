/**
 * 补生成 shichen-zi.jpg：画布上 music-shichen-zi 重名，改用唯一节点名。
 * 运行：npx tsx scripts/gen-shichen-zi-fix.ts
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { buildMusicImageJobs } from '../lib/music-image-prompts';

const OUT_DIR = path.resolve(__dirname, '../public/images/music');
const NODE_NAME = 'music-shichen-zi-fix';

function runLibtv(args: string[]): string {
  const result = spawnSync('libtv', args, {
    encoding: 'utf-8',
    maxBuffer: 30 * 1024 * 1024,
    shell: false,
  });
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) throw new Error(out.trim() || `libtv exit ${result.status}`);
  return out;
}

function extractImageUrl(stdout: string): string | null {
  const m = stdout.match(/https:\/\/[^\s"\\]+\.(?:png|jpe?g|webp)/i);
  return m?.[0] ?? null;
}

async function main() {
  const job = buildMusicImageJobs().find(j => j.filename === 'shichen-zi.jpg');
  if (!job) throw new Error('shichen-zi job not found');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const destJpg = path.join(OUT_DIR, 'shichen-zi.jpg');
  console.log(`[gen] ${job.filename} via ${NODE_NAME}`);

  let url: string | null = null;
  try {
    const stdout = runLibtv([
      'node',
      '--x', '12000',
      '--y', '0',
      'create', NODE_NAME,
      '-t', 'image',
      '-s', 'model=Seedream 5.0 Pro',
      '-s', 'ratio=1:1',
      '-s', 'quality=2K',
      '--prompt', job.prompt,
      '--run',
    ]);
    url = extractImageUrl(stdout);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/exist|已存在|already/i.test(msg)) throw e;
    console.log(`[retry-run] ${NODE_NAME}`);
    runLibtv(['node', NODE_NAME, '--prompt', job.prompt, '--run']);
  }

  if (!url) {
    const nodeOut = runLibtv(['node', NODE_NAME]);
    url = extractImageUrl(nodeOut);
  }
  if (!url) throw new Error(`no image URL for ${NODE_NAME}`);
  console.log(`[url] ${url}`);

  const tmpPng = path.join(OUT_DIR, 'shichen-zi.tmp.png');
  const curl = spawnSync('curl', ['-fsSL', '-o', tmpPng, url], { stdio: 'inherit', shell: false });
  if (curl.status !== 0) throw new Error('curl failed');

  await sharp(tmpPng)
    .resize({ width: 1024, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toFile(destJpg);
  fs.unlinkSync(tmpPng);

  const count = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.jpg')).length;
  console.log(`[done] ${destJpg} (${fs.statSync(destJpg).size} bytes)`);
  console.log(`[count] ${count}/59`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
