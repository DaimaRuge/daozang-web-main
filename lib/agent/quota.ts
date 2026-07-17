/**
 * AI 匿名配额中间件。
 *
 * 未登录用户按 session / IP 哈希每日限次；登录用户配额更高。
 * 配额在 AI 调用成功前检查、成功后扣减。
 */

import { auth } from '@/auth';
import { getAiQuotaCount, incrementAiQuota } from '@/lib/db';
import { AgentContext } from './context';

const DEFAULT_ANON_QUOTA = 5;
const AUTHED_QUOTA = 50;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function hashIp(ip: string): string {
  let h = 0;
  for (let i = 0; i < ip.length; i++) h = (Math.imul(31, h) + ip.charCodeAt(i)) | 0;
  return `ip:${Math.abs(h).toString(36)}`;
}

/** 从请求头解析客户端 IP（Vercel / 反向代理兼容） */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/** 构造配额键：登录用户优先，否则 sessionId，最后 IP 哈希 */
export async function resolveQuotaKey(
  request: Request,
  context: AgentContext,
): Promise<{ key: string; isAuthenticated: boolean; limit: number }> {
  const session = await auth();
  if (session?.user?.id) {
    return {
      key: `user:${session.user.id}`,
      isAuthenticated: true,
      limit: AUTHED_QUOTA,
    };
  }
  const sessionId = context.session?.sessionId;
  if (sessionId && sessionId !== 'anonymous') {
    return {
      key: `anon:${sessionId}`,
      isAuthenticated: false,
      limit: Number(process.env.DZ_AI_DAILY_QUOTA) || DEFAULT_ANON_QUOTA,
    };
  }
  return {
    key: hashIp(getClientIp(request)),
    isAuthenticated: false,
    limit: Number(process.env.DZ_AI_DAILY_QUOTA) || DEFAULT_ANON_QUOTA,
  };
}

export interface QuotaStatus {
  allowed: boolean;
  remaining: number;
  limit: number;
  isAuthenticated: boolean;
}

/** 检查配额（不扣减） */
export async function checkAiQuota(request: Request, context: AgentContext): Promise<QuotaStatus> {
  const { key, isAuthenticated, limit } = await resolveQuotaKey(request, context);
  const used = getAiQuotaCount(key, todayKey());
  return {
    allowed: used < limit,
    remaining: Math.max(0, limit - used),
    limit,
    isAuthenticated,
  };
}

/** 扣减一次配额，返回扣减后剩余次数 */
export async function consumeAiQuota(request: Request, context: AgentContext): Promise<QuotaStatus> {
  const status = await checkAiQuota(request, context);
  if (!status.allowed) return status;
  const { key } = await resolveQuotaKey(request, context);
  const used = incrementAiQuota(key, todayKey());
  return {
    ...status,
    remaining: Math.max(0, status.limit - used),
  };
}
