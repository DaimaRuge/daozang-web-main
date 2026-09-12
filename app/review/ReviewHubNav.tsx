import Link from 'next/link';

/**
 * 审核台顶栏：解析审核与图谱审核共用入口。
 * 两者都是开发环境的学者校正层，拆成两个路由以免把两套队列揉进同一表单。
 */
export default function ReviewHubNav({ current }: { current: 'parse' | 'graph' }) {
  const item = (href: string, id: 'parse' | 'graph', label: string) => {
    const active = current === id;
    return (
      <Link
        href={href}
        className={`text-sm px-2 py-1 rounded ${
          active
            ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
            : 'text-[var(--muted)] hover:text-[var(--text)]'
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav className="flex gap-4 mb-6" aria-label="审核类型">
      {item('/review', 'parse', '解析结构')}
      {item('/review/graph', 'graph', '图谱关系')}
    </nav>
  );
}
