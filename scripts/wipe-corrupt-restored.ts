import fs from 'fs';
import {
  loadDaozangImageCatalog,
  restoredCinnabarPath,
  restoredImagePath,
  restoredInkPath,
  restoredJpegPath,
} from '../lib/daozang-images';

function pngOk(abs: string): boolean {
  if (!fs.existsSync(abs)) return false;
  const st = fs.statSync(abs);
  if (st.size < 32) return false;
  const fd = fs.openSync(abs, 'r');
  const buf = Buffer.alloc(8);
  fs.readSync(fd, buf, 0, 8, 0);
  fs.closeSync(fd);
  return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

function wipe(part: string, file: string) {
  for (const p of [
    restoredInkPath(part, file),
    restoredCinnabarPath(part, file),
    restoredImagePath(part, file),
    restoredJpegPath(part, file),
  ]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

function main() {
  const catalog = loadDaozangImageCatalog();
  if (!catalog) throw new Error('no catalog');
  let wiped = 0;
  const sample: { part: string; file: string }[] = [];
  for (const b of Object.values(catalog.books)) {
    for (const h of b.images) {
      if (!h.f || !h.p) continue;
      const ink = restoredInkPath(h.p, h.f);
      const png = restoredImagePath(h.p, h.f);
      const cin = restoredCinnabarPath(h.p, h.f);
      const any = fs.existsSync(ink) || fs.existsSync(png) || fs.existsSync(cin);
      if (!any) continue;
      const complete = pngOk(ink) && pngOk(png);
      if (complete) continue;
      wipe(h.p, h.f);
      wiped++;
      if (sample.length < 20) sample.push({ part: h.p, file: h.f });
    }
  }
  console.log(JSON.stringify({ wiped, sample }, null, 2));
}

main();
