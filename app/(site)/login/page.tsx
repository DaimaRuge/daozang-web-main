import { Suspense } from 'react';
import LoginPage from './LoginForm';

export default function Page() {
  return (
    <Suspense fallback={<p className="text-center text-sm text-[var(--muted)] py-12">加载中…</p>}>
      <LoginPage />
    </Suspense>
  );
}
