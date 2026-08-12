/**
 * PostgreSQL 连接原语（服务端 only）。
 *
 * 为什么是模块级单例池：serverless 实例会复用同一个 Node 进程，
 * 每请求新建 TCP 连接会迅速耗尽云端 Postgres 的连接配额；
 * max 压到 5 是因为线上会有多个并发实例，单实例占用必须克制
 * （生产应配合 Neon/Supabase 的 pooled 连接串一起使用）。
 */

import pg from 'pg';
import type { Pool } from 'pg';

// pg 默认把 int8(BIGINT) 解析成字符串以避免精度丢失。
// 本项目的 BIGINT 只有毫秒时间戳与 COUNT 结果，均远小于 2^53，
// 转成 Number 才能让上层的 created_at: number 等类型保持与 SQLite 时代一致。
pg.types.setTypeParser(pg.types.builtins.INT8, (value: string) => Number(value));

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL 未配置：需要 PostgreSQL 连接串');
  }
  pool = new pg.Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

/** 查询多行 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

/** 查询首行，无结果返回 undefined */
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}

/** 执行写操作，返回受影响行数 */
export async function execute(text: string, params: unknown[] = []): Promise<number> {
  const result = await getPool().query(text, params);
  return result.rowCount ?? 0;
}

/**
 * 关闭连接池。仅供测试与一次性脚本调用——
 * 不关池的话 node:test 与 tsx 脚本会因为句柄未释放而挂住不退出。
 */
export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}
