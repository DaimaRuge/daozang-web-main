/**
 * 存储层纯函数单测。
 *
 * 只测 key 构造与 URL 解析——这两处一旦出错会导致大批资产 404，
 * 且不需要网络即可覆盖。真正的上传走 scripts/upload-media.ts 手工验证。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildStorageKey, isOwnedStorageKey } from '../lib/storage';
import { resolveMediaUrl } from '../lib/media-url';

describe('buildStorageKey', () => {
  test('按类型与年月分目录，保留扩展名', () => {
    const key = buildStorageKey('audio', 'wuxing-jin.mp3', new Date('2026-08-10T00:00:00Z'));
    assert.match(key, /^audio\/2026\/08\/wuxing-jin-[a-z0-9]{8}\.mp3$/);
  });

  test('同名文件两次调用产生不同 key，避免互相覆盖', () => {
    const a = buildStorageKey('image', 'cover.jpg');
    const b = buildStorageKey('image', 'cover.jpg');
    assert.notEqual(a, b);
  });

  test('清洗掉路径分隔符与空格，防止穿目录', () => {
    const key = buildStorageKey('image', '../evil dir/pic name.png');
    assert.equal(key.includes('..'), false);
    assert.equal(key.includes(' '), false);
    assert.match(key, /\.png$/);
  });
});

describe('isOwnedStorageKey', () => {
  test('只接受本类型下按年月分目录的单文件 key', () => {
    assert.equal(isOwnedStorageKey('image', 'image/2026/08/cover-abcd1234.jpg'), true);
    assert.equal(isOwnedStorageKey('audio', 'audio/2026/08/chant-deadbeef.mp3'), true);
  });

  test('拒绝穿目录、错类型与多余路径段', () => {
    assert.equal(isOwnedStorageKey('image', 'audio/2026/08/cover-abcd1234.jpg'), false);
    assert.equal(isOwnedStorageKey('image', 'image/2026/08/a/b.jpg'), false);
    assert.equal(isOwnedStorageKey('image', '../image/2026/08/x.jpg'), false);
    assert.equal(isOwnedStorageKey('image', '/image/2026/08/x.jpg'), false);
    assert.equal(isOwnedStorageKey('image', 'image/cover.jpg'), false);
  });
});

// resolveMediaUrl 把 base 作为参数而非直接读环境变量，
// 正是为了让这三个用例不必摆弄 process.env 就能覆盖全部分支。
describe('resolveMediaUrl', () => {
  test('未配置 CDN 域名时原样返回站内路径', () => {
    assert.equal(resolveMediaUrl('/audio/wuxing-jin.mp3', ''), '/audio/wuxing-jin.mp3');
  });

  test('配置了 CDN 域名时拼接为绝对地址，并去掉重复斜杠', () => {
    assert.equal(
      resolveMediaUrl('/audio/wuxing-jin.mp3', 'https://media.daozang.org/'),
      'https://media.daozang.org/audio/wuxing-jin.mp3',
    );
  });

  test('站内路径缺少前导斜杠时补齐', () => {
    assert.equal(
      resolveMediaUrl('audio/wuxing-jin.mp3', 'https://media.daozang.org'),
      'https://media.daozang.org/audio/wuxing-jin.mp3',
    );
  });

  test('已经是绝对地址时不做处理', () => {
    assert.equal(
      resolveMediaUrl('https://cdn.example.com/a.mp3', 'https://media.daozang.org'),
      'https://cdn.example.com/a.mp3',
    );
  });
});
