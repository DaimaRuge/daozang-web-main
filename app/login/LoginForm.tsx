'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/library';

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name: name || undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '注册失败');
      }

      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });
      if (result?.error) throw new Error('邮箱或密码错误');

      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in max-w-sm mx-auto py-12">
      <h1 className="text-2xl font-serif tracking-wider mb-2 text-center">
        {mode === 'login' ? '登录' : '注册'}
      </h1>
      <p className="text-xs text-[var(--muted)] text-center mb-8">
        登录后可同步阅读进度至云端（多端续读）
      </p>

      <form onSubmit={submit} className="space-y-4">
        {mode === 'register' && (
          <input
            type="text"
            placeholder="昵称（可选）"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:border-[var(--accent)]"
          />
        )}
        <input
          type="email"
          required
          placeholder="邮箱"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:border-[var(--accent)]"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="密码（至少 6 位）"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:border-[var(--accent)]"
        />

        {error && <p className="text-xs text-[var(--cinnabar)]">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm hover:opacity-90 disabled:opacity-50"
        >
          {loading ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录'}
        </button>
      </form>

      <p className="text-xs text-center text-[var(--muted)] mt-6">
        {mode === 'login' ? (
          <>
            还没有账号？{' '}
            <button type="button" onClick={() => setMode('register')} className="text-[var(--accent)] hover:underline">
              注册
            </button>
          </>
        ) : (
          <>
            已有账号？{' '}
            <button type="button" onClick={() => setMode('login')} className="text-[var(--accent)] hover:underline">
              登录
            </button>
          </>
        )}
      </p>

      <p className="text-center mt-8">
        <Link href="/" className="text-xs text-[var(--muted)] hover:text-[var(--accent)]">← 返回首页</Link>
      </p>
    </div>
  );
}
