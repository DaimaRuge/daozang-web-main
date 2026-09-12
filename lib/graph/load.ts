/**
 * 图谱产物加载（仅服务端，依赖 fs）。
 *
 * 为什么从 query.ts 拆出来：
 * 1. 查询层、测试、构建脚本都要读同一份产物，加载逻辑只能有一处，
 *    否则 gzip / 明文两套格式会各写各的；
 * 2. 本文件零业务查询，只负责「磁盘 → KnowledgeGraph」。
 *
 * 为什么默认读 gzip：并入自动术语后明文 graph.json 约 14MB，
 * 超过 Vercel 打进 Serverless Function 的单文件安全阈值（约 10MB），
 * 预览部署会失败。gzip 后约 3MB，语义不变，CDN 与函数包都能接受。
 * 本地若仍有明文 graph.json（旧产物），作为回退继续可读。
 */

import fs from 'fs';
import path from 'path';
import { gunzipSync } from 'zlib';
import { KnowledgeGraph } from './schema';

const DATA_DIR = path.resolve(process.cwd(), 'public', 'data');
export const GRAPH_JSON_PATH = path.join(DATA_DIR, 'graph.json');
export const GRAPH_GZIP_PATH = path.join(DATA_DIR, 'graph.json.gz');

/** Vercel 函数包内单文件的安全上限；超过则部署失败 */
export const GRAPH_ARTIFACT_MAX_BYTES = 10 * 1024 * 1024;

function parseGraphBuffer(buf: Buffer): KnowledgeGraph {
  const json =
    buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b
      ? gunzipSync(buf).toString('utf8')
      : buf.toString('utf8');
  return JSON.parse(json) as KnowledgeGraph;
}

/** 加载图谱产物。缺失时返回 null，调用方决定是否降级。 */
export function loadKnowledgeGraph(): KnowledgeGraph | null {
  if (fs.existsSync(GRAPH_GZIP_PATH)) {
    return parseGraphBuffer(fs.readFileSync(GRAPH_GZIP_PATH));
  }
  if (fs.existsSync(GRAPH_JSON_PATH)) {
    return parseGraphBuffer(fs.readFileSync(GRAPH_JSON_PATH));
  }
  return null;
}

export function graphArtifactExists(): boolean {
  return fs.existsSync(GRAPH_GZIP_PATH) || fs.existsSync(GRAPH_JSON_PATH);
}
