import type { ReactNode } from 'react';
import { redirect, notFound } from 'next/navigation';
import { AuthzError, requireRole } from '@/lib/auth-role';
import { findUserById } from '@/lib/db';

/**
 * 运营后台壳：最低 moderator。
 * 未登录去登录页；权限不足返回 404，避免向普通读者暴露后台入口。
 */
export const dynamic = 'force-dynamic';

export default async function StudioLayout({ children }: { children: ReactNode }) {
  try {
    const { userId } = await requireRole('moderator');
    const user = await findUserById(userId);
    if (!user || user.status === 'banned') notFound();
  } catch (err) {
    if (err instanceof AuthzError && err.statusCode === 401) {
      redirect('/login?callbackUrl=/studio');
    }
    notFound();
  }

  return <>{children}</>;
}
