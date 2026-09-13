/**
 * 原书插图：书目对位、偏移定位、阅读块注入。
 * 运行：npx tsx --test tests/daozang-images.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { DaozangEntry } from '../lib/data';
import { parseText } from '../lib/text-parser';
import {
  anchorFromContext,
  cjkOnly,
  injectDaozangImages,
  isTalismanContext,
  locateCharOffset,
  matchTxtFileToEntry,
  offsetToLine,
  originalImagePath,
  resolveDaozangImageFile,
  restoredCinnabarPath,
  restoredImagePath,
  restoredInkPath,
  stemFilename,
  type DaozangBookImages,
} from '../lib/daozang-images';
import path from 'node:path';

function entry(filename: string, title: string, id: string): DaozangEntry {
  return {
    id,
    title,
    collection: '正统道藏',
    category: '正一部',
    subcategory: '',
    filename,
    size: 1,
    lineCount: 1,
    preview: '',
  };
}

describe('matchTxtFileToEntry', () => {
  const a = entry('正統道藏正一部-上清天關三圖經.txt', '上清天關三圖經', 'id-santu');
  const b = entry('正統道藏太玄部-周易參同契發揮-宋-俞琰.txt', '周易參同契發揮', 'id-cantong');
  const byStem = new Map([
    [stemFilename(a.filename), a],
    [stemFilename(b.filename), b],
  ]);

  test('文件名全等对上本站条目', () => {
    const hit = matchTxtFileToEntry('正統道藏正一部-上清天關三圖經', byStem);
    assert.equal(hit?.entry.id, 'id-santu');
    assert.equal(hit?.method, 'filename');
  });

  test('txt 缺作者后缀时，唯一前缀仍能对上', () => {
    const hit = matchTxtFileToEntry('正統道藏太玄部-周易參同契發揮', byStem);
    assert.equal(hit?.entry.id, 'id-cantong');
    assert.equal(hit?.method, 'filename-prefix');
  });

  test('对不上的 txt 返回 null，避免低分错配', () => {
    assert.equal(matchTxtFileToEntry('續道藏-搜神記', byStem), null);
  });
});

describe('locateCharOffset', () => {
  const source = '甲乙丙丁戊己庚辛安鎮東維青華丈人其後正文';

  test('偏移落在正文长度内时直接采用，避免网页版上下文在全文误命中', () => {
    assert.equal(locateCharOffset(source, { o: 8, a: '安鎮東維青華丈人' }), 8);
  });

  test('偏移越界时才用图前锚点兜底', () => {
    const offset = locateCharOffset(source, { o: 99999, a: '安鎮東維青華丈人' });
    assert.equal(source.slice(offset, offset + 2), '其後');
  });
});

describe('offsetToLine / cjkOnly', () => {
  test('按换行把字符偏移换成阅读器行号', () => {
    assert.equal(offsetToLine('一\n二\n三', 4), 2);
  });

  test('锚点只保留汉字，去掉标点与控制符', () => {
    assert.equal(cjkOnly('安鎮、東維。青華丈人'), '安鎮東維青華丈人');
    assert.equal(anchorFromContext('……安鎮東維青華丈人符圖', 8), '東維青華丈人符圖');
  });
});

describe('isTalismanContext', () => {
  test('书名或邻近正文含符印则视为符类', () => {
    assert.equal(isTalismanContext('太上秘法鎮宅靈符'), true);
    assert.equal(isTalismanContext('上清天關三圖經', '右符朱書'), true);
    assert.equal(isTalismanContext('皇極經世', '其圖如後'), false);
  });
});

describe('resolveDaozangImageFile', () => {
  const part = '洞真部';
  const scan = originalImagePath(part, 'sample.jpg');
  const restored = restoredImagePath(part, 'sample.jpg');
  const ink = restoredInkPath(part, 'sample.jpg');
  const cinnabar = restoredCinnabarPath(part, 'sample.jpg');
  const present = new Set([scan, restored, ink, cinnabar].map(p => path.normalize(p)));
  const exists = (p: string) => present.has(path.normalize(p));

  test('请求 jpg 只给原扫描，即使 restored 已存在', () => {
    const hit = resolveDaozangImageFile(part, 'sample.jpg', exists);
    assert.equal(hit?.kind, 'scan');
    assert.equal(path.normalize(hit?.absPath ?? ''), path.normalize(scan));
  });

  test('请求 ink.png 缺文件时不回落到 jpg', () => {
    const none = () => false;
    assert.equal(resolveDaozangImageFile(part, 'sample.ink.png', none), null);
  });

  test('请求 ink / cinnabar / png 各走 restored 对应文件', () => {
    assert.equal(resolveDaozangImageFile(part, 'sample.ink.png', exists)?.kind, 'ink');
    assert.equal(resolveDaozangImageFile(part, 'sample.cinnabar.png', exists)?.kind, 'cinnabar');
    assert.equal(resolveDaozangImageFile(part, 'sample.png', exists)?.kind, 'restored');
  });
});

describe('injectDaozangImages', () => {
  test('在锚点所在段落之后插入原书插图与图注，不改原文块', () => {
    const source = '上清天關三圖經\n經名：測試\n安鎮東維青華丈人\n其後正文。';
    const parsed = parseText(source, 'book-test', '上清天關三圖經');
    const originalTypes = parsed.blocks.map(b => b.type);
    const at = source.indexOf('安鎮東維青華丈人');
    const book: DaozangBookImages = {
      bookId: 'book-test',
      title: '上清天關三圖經',
      filename: '正統道藏正一部-上清天關三圖經.txt',
      txtFile: '正統道藏正一部-上清天關三圖經',
      match: 'filename',
      images: [
        {
          p: '正乙部',
          f: 'CH07174image001.jpg',
          o: at,
          m: 'before',
          w: 68,
          h: 207,
          a: '安鎮東維青華丈人',
        },
      ],
    };

    const injected = injectDaozangImages(parsed, source, book);
    const image = injected.blocks.find(b => b.type === 'image');
    const caption = injected.blocks.find(b => b.type === 'image-caption');
    assert.ok(image);
    assert.ok(caption);
    assert.equal(image?.parser, 'daozang-scan');
    assert.match(image?.content ?? '', /\/daozang-images\//);
    assert.match(caption?.content ?? '', /原书插图/);
    assert.equal(caption?.parser, 'daozang-scan');
    assert.deepEqual(
      injected.blocks.filter(b => b.type !== 'image' && b.type !== 'image-caption').map(b => b.type),
      originalTypes,
    );
    assert.equal(image?.originalSrc, image?.content);
  });

  test('有复原时正文用 PNG，originalSrc 仍指向原扫描 jpg', () => {
    const source = '太上秘法鎮宅靈符\n經名：測試\n安鎮東維青華丈人符\n其後正文。';
    const parsed = parseText(source, 'book-fu', '太上秘法鎮宅靈符');
    const at = source.indexOf('安鎮東維青華丈人符');
    const book: DaozangBookImages = {
      bookId: 'book-fu',
      title: '太上秘法鎮宅靈符',
      filename: '正統道藏洞真部神符類-太上秘法鎮宅靈符.txt',
      txtFile: '正統道藏洞真部神符類-太上秘法鎮宅靈符',
      match: 'filename',
      images: [
        {
          p: '洞真部',
          f: 'CNDZ010208太上秘法鎮宅靈符image086.jpg',
          o: at,
          m: 'before',
          w: 86,
          h: 210,
        },
      ],
    };
    const injected = injectDaozangImages(parsed, source, book, () => ({
      ink: true,
      cinnabar: true,
      restored: true,
    }));
    const image = injected.blocks.find(b => b.type === 'image');
    const caption = injected.blocks.find(b => b.type === 'image-caption');
    assert.equal(image?.parser, 'daozang-restored');
    assert.match(image?.content ?? '', /\.cinnabar\.png$/);
    assert.match(image?.originalSrc ?? '', /image086\.jpg$/);
    assert.match(image?.inkSrc ?? '', /\.ink\.png$/);
    assert.match(image?.cinnabarSrc ?? '', /\.cinnabar\.png$/);
    assert.match(caption?.content ?? '', /对照原扫描/);
  });
});

