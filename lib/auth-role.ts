/**
 * 角色模型与服务端权限守卫。
 *
 * 为什么用等级数字而不是权限位图：当前角色是严格递进的
 * （admin ⊃ editor ⊃ moderator ⊃ contributor ⊃ reader），
 * 等级比较足够表达，且比权限矩阵少一个需要同步维护的真相来源。
 * 将来若出现交叉权限，再升级为矩阵。
 */

import { auth } from '@/auth';
import { findUserById } from '@/lib/db';

export type UserRole = 'reader' | 'contributor' | 'moderator' | 'editor' | 'admin';

export const ROLE_LEVEL: Record<UserRole, number> = {
  reader: 0,
  contributor: 1,
  moderator: 2,
  editor: 3,
  admin: 4,
};

export function hasRole(actual: UserRole, required: UserRole): boolean {
  return ROLE_LEVEL[actual] >= ROLE_LEVEL[required];
}

/** 权限不足时抛出的错误，路由层据此返回 401/403 */
export class AuthzError extends Error {
  constructor(readonly statusCode: 401 | 403, message: string) {
    super(message);
    this.name = 'AuthzError';
  }
}

/**
 * 服务端守卫：校验当前会话满足最低角色要求。
 * 后台页面与 /api/studio/* 统一从这里取身份，避免每个路由各写一遍判断。
 */
export async function requireRole(required: UserRole): Promise<{ userId: string; role: UserRole }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new AuthzError(401, '未登录');

  const role = (session.user.role ?? 'reader') as UserRole;
  if (!hasRole(role, required)) {
    throw new AuthzError(403, `需要 ${required} 及以上权限`);
  }
  return { userId, role };
}

/** 发帖等写操作：登录且未被封禁/禁言 */
export async function requireActiveUser(): Promise<{ userId: string; role: UserRole }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new AuthzError(401, '未登录');

  const user = await findUserById(userId);
  if (!user || user.status === 'banned') throw new AuthzError(403, '账号已停用');
  if (user.status === 'muted') throw new AuthzError(403, '账号已禁言');

  const role = (user.role ?? 'reader') as UserRole;
  return { userId, role };
}
