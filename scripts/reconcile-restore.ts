import fs from 'fs';
import sharp from 'sharp';
import {
  hasRestoredImage,
  loadDaozangImageCatalog,
  originalImagePath,
} from '../lib/daozang-images';

async function main() {
  const c = loadDaozangImageCatalog();
  if (!c) throw new Error('no catalog');
  let total = 0;
  let restored = 0;
  let missing = 0;
  let tiny = 0;
  let todo = 0;
  const leftover: { part: string; file: string; reason: string }[] = [];
  for (const b of Object.values(c.books)) {
    for (const h of b.images) {
      if (!h.f || !h.p) continue;
      total++;
      if (hasRestoredImage(h.p, h.f)) {
        restored++;
        continue;
      }
      const src = originalImagePath(h.p, h.f);
      if (!fs.existsSync(src)) {
        missing++;
        leftover.push({ part: h.p, file: h.f, reason: 'missing' });
        continue;
      }
      try {
        const m = await sharp(src, { failOn: 'none' }).metadata();
        const min = Math.min(m.width || 0, m.height || 0);
        if (min > 0 && min < 24) {
          tiny++;
          continue;
        }
        todo++;
        if (leftover.length < 40) leftover.push({ part: h.p, file: h.f, reason: `todo ${m.width}x${m.height}` });
      } catch {
        todo++;
        leftover.push({ part: h.p, file: h.f, reason: 'decode' });
      }
    }
  }
  console.log(JSON.stringify({ total, restored, tiny, missing, todo, leftover }, null, 2));
}

main();
