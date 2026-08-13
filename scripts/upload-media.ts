/**
 * 存量媒体批量上传到对象存储。
 *
 * 刻意保持 public/ 下的相对路径作为对象 key：
 * 代码里成百上千处 '/audio/xxx.mp3' 的写法因此完全不用改，
 * 只要 mediaUrl() 前缀上 CDN 域名就能命中。
 * 幂等：已存在同 key 的对象会被同内容覆盖，重跑安全。
 */

import fs from 'fs';
import path from 'path';
import { uploadObject } from '../lib/storage';

const ROOTS = ['audio', 'images'];

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/**
 * tsx 不会自动加载 .env.local；Windows 上靠 shell 导出又容易漏变量。
 * 这里只读本地未跟踪文件，且不覆盖已在环境里显式设置的值。
 */
function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

async function main(): Promise<void> {
  loadEnvLocal();

  const publicDir = path.join(process.cwd(), 'public');
  let count = 0;
  let bytes = 0;

  for (const root of ROOTS) {
    const dir = path.join(publicDir, root);
    if (!fs.existsSync(dir)) {
      console.log(`[upload] ${root}/ 不存在，跳过`);
      continue;
    }
    for (const file of walk(dir)) {
      const ext = path.extname(file).toLowerCase();
      const contentType = MIME[ext];
      if (!contentType) {
        console.warn(`[upload] 跳过未知类型：${file}`);
        continue;
      }
      // key 就是去掉 public/ 前缀的站内路径，Windows 反斜杠统一成正斜杠
      const key = path.relative(publicDir, file).split(path.sep).join('/');
      const body = fs.readFileSync(file);
      await uploadObject(key, body, contentType);
      count += 1;
      bytes += body.byteLength;
      console.log(`[upload] ${key}  ${(body.byteLength / 1024).toFixed(0)} KB`);
    }
  }

  console.log(`[upload] 完成：${count} 个文件，共 ${(bytes / 1024 / 1024).toFixed(1)} MB`);
}

main().catch(err => {
  console.error('[upload] 失败：', err);
  process.exit(1);
});
