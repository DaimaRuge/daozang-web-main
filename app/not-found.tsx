import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="text-center py-24 animate-fade-in">
      <h1 className="text-6xl font-serif text-[var(--accent)] mb-4">404</h1>
      <p className="text-[var(--muted)] mb-8">未找到您所寻找的经文</p>
      <Link href="/" className="text-sm text-[var(--accent)] hover:underline">返回首页</Link>
    </div>
  );
}
