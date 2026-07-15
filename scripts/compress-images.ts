/**
 * 生成图压缩：2K PNG（7-8MB）→ Web 用 JPEG。
 * hero 缩到 1792 宽、五行图缩到 1024 宽，成功后删除原 PNG。
 * 运行：npx tsx scripts/compress-images.ts
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const DIR = path.resolve(__dirname, '../public/images');

async function compress(name: string, maxWidth: number) {
  const src = path.join(DIR, `${name}.png`);
  const dest = path.join(DIR, `${name}.jpg`);
  if (!fs.existsSync(src)) {
    console.log(`[skip] ${name}.png 不存在`);
    return;
  }
  await sharp(src).resize({ width: maxWidth, withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(dest);
  const kb = Math.round(fs.statSync(dest).size / 1024);
  fs.unlinkSync(src);
  console.log(`[ok] ${name}.jpg ${kb}KB`);
}

async function main() {
  await compress('hero', 1792);
  for (const n of ['jin', 'mu', 'shui', 'huo', 'tu']) {
    await compress(`wuxing-${n}`, 1024);
  }
}

main();
