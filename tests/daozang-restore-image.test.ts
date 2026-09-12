/**
 * 线稿抠透明：白纸应变透明，墨线应保留。
 * 运行：npx tsx --test tests/daozang-restore-image.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { toOpaqueJpeg, toTransparentPng, tintCinnabarPng, isNoopRestore, writeRestoreVariants } from '../lib/daozang-restore-image';

test('透明 PNG 把浅底抠掉，墨线仍不透明', async () => {
  const src = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r: 230, g: 230, b: 225 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 8, height: 24, channels: 3, background: { r: 20, g: 20, b: 20 } },
        })
          .png()
          .toBuffer(),
        left: 12,
        top: 4,
      },
    ])
    .png()
    .toBuffer();

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-restore-'));
  const png = path.join(dir, 'out.png');
  await toTransparentPng(src, png, 64);
  const meta = await sharp(png).metadata();
  assert.equal(meta.format, 'png');
  assert.equal(meta.hasAlpha, true);

  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => (y * info.width + x) * 4;
  const cornerA = data[at(1, 1) + 3];
  const midA = data[at(Math.floor(info.width / 2), Math.floor(info.height / 2)) + 3];
  assert.equal(cornerA, 0);
  assert.ok(midA > 200, `ink alpha ${midA}`);
});

test('JPG 没有 alpha，白底铺满', async () => {
  const src = await sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 240, g: 240, b: 240 } },
  })
    .png()
    .toBuffer();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-restore-'));
  const jpg = path.join(dir, 'out.jpg');
  await toOpaqueJpeg(src, jpg, 32);
  const meta = await sharp(jpg).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.hasAlpha, false);
});

test('朱砂版与墨线同尺寸，不透明像素为朱砂且 alpha 一致', async () => {
  const src = await sharp({
    create: {
      width: 24,
      height: 24,
      channels: 3,
      background: { r: 230, g: 230, b: 225 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 6, height: 16, channels: 3, background: { r: 15, g: 15, b: 15 } },
        })
          .png()
          .toBuffer(),
        left: 9,
        top: 4,
      },
    ])
    .png()
    .toBuffer();

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-restore-'));
  const ink = path.join(dir, 'out.ink.png');
  const red = path.join(dir, 'out.cinnabar.png');
  await toTransparentPng(src, ink, 48);
  await tintCinnabarPng(ink, red);
  const inkMeta = await sharp(ink).metadata();
  const redMeta = await sharp(red).metadata();
  assert.equal(inkMeta.width, redMeta.width);
  assert.equal(inkMeta.height, redMeta.height);

  const inkRaw = await sharp(ink).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const redRaw = await sharp(red).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let checked = 0;
  for (let i = 0; i < inkRaw.data.length; i += 4) {
    assert.equal(redRaw.data[i + 3], inkRaw.data[i + 3]);
    if (inkRaw.data[i + 3] > 200) {
      assert.ok(Math.abs(redRaw.data[i] - 0xa8) <= 8, `R ${redRaw.data[i]}`);
      assert.ok(Math.abs(redRaw.data[i + 1] - 0x3f) <= 8, `G ${redRaw.data[i + 1]}`);
      checked++;
    }
  }
  assert.ok(checked > 10);
});

test('与原图字节相同或几乎未放大视为无效复原', async () => {
  const buf = Buffer.from([1, 2, 3, 4]);
  assert.equal(await isNoopRestore(buf, buf), true);
  const small = await sharp({
    create: { width: 40, height: 80, channels: 3, background: { r: 20, g: 20, b: 20 } },
  })
    .png()
    .toBuffer();
  assert.equal(await isNoopRestore(small, small), true);
  const big = await sharp(small).resize({ width: 200, height: 400, kernel: 'nearest' }).png().toBuffer();
  assert.equal(await isNoopRestore(small, big), false);
});

test('writeRestoreVariants 同时写出墨线、朱砂与默认 png', async () => {
  const src = await sharp({
    create: { width: 16, height: 32, channels: 3, background: { r: 240, g: 240, b: 235 } },
  })
    .png()
    .toBuffer();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dz-restore-'));
  const png = path.join(dir, 'stem.png');
  const jpg = path.join(dir, 'stem.jpg');
  const out = await writeRestoreVariants(src, png, jpg, { longEdge: 64, cinnabar: true });
  assert.equal(fs.existsSync(out.inkPng), true);
  assert.equal(fs.existsSync(out.cinnabarPng), true);
  assert.equal(fs.existsSync(out.png), true);
  assert.equal((await sharp(jpg).metadata()).hasAlpha, false);
});

