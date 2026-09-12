/**
 * 细条跳过清单：筛选、形状、放大尺寸。
 * 运行：npx tsx --test tests/daozang-tiny-skips.test.ts
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterTinySkips,
  tinySkipBookOptions,
  tinySkipDisplaySize,
  tinySkipPartOptions,
  tinySkipShape,
  type TinySkipItem,
} from '../lib/daozang-tiny-skips';

function item(partial: Partial<TinySkipItem> & Pick<TinySkipItem, 'file' | 'width' | 'height'>): TinySkipItem {
  return {
    bookId: 'book-a',
    title: '太上秘法鎮宅靈符',
    part: '洞神部',
    ...partial,
  };
}

const SAMPLE: TinySkipItem[] = [
  item({ file: 'image001.jpg', width: 8, height: 120, part: '洞神部' }),
  item({ file: 'image002.jpg', width: 180, height: 10, part: '洞神部' }),
  item({ file: 'image003.jpg', width: 20, height: 22, part: '正一部' }),
  item({
    bookId: 'book-b',
    title: '上清天關三圖經',
    part: '正一部',
    file: 'tu-01.png',
    width: 16,
    height: 16,
  }),
];

describe('tinySkipShape', () => {
  test('竖条 / 横条 / 小印', () => {
    assert.equal(tinySkipShape({ width: 8, height: 120 }), 'strip-v');
    assert.equal(tinySkipShape({ width: 180, height: 10 }), 'strip-h');
    assert.equal(tinySkipShape({ width: 20, height: 22 }), 'stamp');
  });
});

describe('tinySkipDisplaySize', () => {
  test('最短边放大到至少 72，且不少于 4 倍', () => {
    const tall = tinySkipDisplaySize({ width: 8, height: 120 });
    assert.equal(tall.width, 8 * 9);
    assert.equal(tall.height, 120 * 9);
    const stamp = tinySkipDisplaySize({ width: 20, height: 22 });
    assert.equal(stamp.width, 80);
    assert.equal(stamp.height, 88);
  });
});

describe('filterTinySkips', () => {
  test('按书、部、形状、关键字筛选', () => {
    assert.equal(filterTinySkips(SAMPLE, { bookId: 'book-b' }).length, 1);
    assert.equal(filterTinySkips(SAMPLE, { part: '正一部' }).length, 2);
    assert.equal(filterTinySkips(SAMPLE, { shape: 'strip-v' })[0].file, 'image001.jpg');
    assert.equal(filterTinySkips(SAMPLE, { q: '三圖' })[0].bookId, 'book-b');
    assert.equal(filterTinySkips(SAMPLE, { q: 'image002' }).length, 1);
  });
});

describe('tinySkip options', () => {
  test('按数量倒序给出书与部', () => {
    const books = tinySkipBookOptions(SAMPLE);
    assert.equal(books[0].bookId, 'book-a');
    assert.equal(books[0].count, 3);
    const parts = tinySkipPartOptions(SAMPLE);
    assert.equal(parts[0].part, '洞神部');
    assert.equal(parts[0].count, 2);
  });
});
