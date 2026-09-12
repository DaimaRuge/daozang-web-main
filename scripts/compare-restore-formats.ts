/**
 * 用同一张镇宅符，产出原图 / 高清 JPG / 透明 PNG，并排对比页。
 * 运行：npx tsx scripts/compare-restore-formats.ts
 * 打开：http://localhost:4000/restore-compare.html
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { originalImagePath } from '../lib/daozang-images';
import { writeRestoreVariants } from '../lib/daozang-restore-image';

const PART = '洞真部';
const FILE = 'CNDZ010208太上秘法鎮宅靈符image086.jpg';
const OUT_DIR = path.join(process.cwd(), 'public', 'restore-compare');

async function inspect(label: string, file: string) {
  const buf = fs.readFileSync(file);
  const meta = await sharp(buf).metadata();
  return {
    label,
    file: path.basename(file),
    bytes: buf.length,
    format: meta.format,
    width: meta.width,
    height: meta.height,
    channels: meta.channels,
    hasAlpha: Boolean(meta.hasAlpha),
    kb: Math.round(buf.length / 102.4) / 10,
  };
}

async function main() {
  const origSrc = originalImagePath(PART, FILE);
  const srcBuf = fs.readFileSync(origSrc);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const origOut = path.join(OUT_DIR, '086-original.png');
  await sharp(srcBuf).png().toFile(origOut);

  const pngOut = path.join(OUT_DIR, '086-restored.png');
  const jpgOut = path.join(OUT_DIR, '086-restored.jpg');
  const variants = await writeRestoreVariants(srcBuf, pngOut, jpgOut, 1024);

  const stats = [
    await inspect('原图（扫描）', origOut),
    await inspect('高清复原 JPG', jpgOut),
    await inspect('高清复原 PNG', pngOut),
  ];
  console.log(JSON.stringify({ variants, stats }, null, 2));

  const cards = stats
    .map(
      s => `<figure>
  <div class="stage"><img src="/restore-compare/${s.file}" alt="${s.label}"></div>
  <figcaption>
    <strong>${s.label}</strong><br>
    ${s.format?.toUpperCase()} · ${s.width}×${s.height} · ${s.kb} KB<br>
    通道 ${s.channels} · ${s.hasAlpha ? '有透明' : '无透明'}
  </figcaption>
</figure>`,
    )
    .join('\n');

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>符图格式对比</title>
  <style>
    body { font-family: "Noto Serif SC", serif; background: #f4efe6; color: #2a2620; margin: 0; padding: 32px; }
    h1 { font-size: 20px; font-weight: 600; }
    p { color: #6b645a; font-size: 14px; max-width: 52rem; line-height: 1.7; }
    .row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; margin-top: 24px; }
    figure { margin: 0; }
    .stage {
      min-height: 420px;
      display: flex; align-items: center; justify-content: center;
      border: 1px solid #d9d1c4; border-radius: 10px;
      background-color: #fff;
      background-image:
        linear-gradient(45deg, #ded6c8 25%, transparent 25%),
        linear-gradient(-45deg, #ded6c8 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #ded6c8 75%),
        linear-gradient(-45deg, transparent 75%, #ded6c8 75%);
      background-size: 20px 20px;
      background-position: 0 0, 0 10px, 10px -10px, -10px 0;
      padding: 16px;
    }
    img { max-height: 380px; max-width: 100%; image-rendering: auto; }
    figcaption { font-size: 13px; margin-top: 10px; line-height: 1.6; }
    .note { margin-top: 28px; font-size: 13px; }
  </style>
</head>
<body>
  <h1>原图 · 高清 JPG · 高清透明 PNG</h1>
  <p>同一张《太上秘法鎮宅靈符》image086。棋盘格用来暴露背景：JPG 会铺出白块，PNG 应只留下墨线。</p>
  <div class="row">${cards}</div>
  <p class="note">JPG 没有 alpha 通道，无法真正透明。阅读页应使用透明 PNG，符图才能叠在宣纸底上，而不是一块灰白扫描矩形。</p>
</body>
</html>`;
  fs.writeFileSync(path.join(OUT_DIR, '..', 'restore-compare.html'), html, 'utf-8');
  console.log('打开 http://localhost:3000/restore-compare.html');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
