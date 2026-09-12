import { listApprovedContributions } from '@/lib/db';
import { mediaUrl } from '@/lib/media-url';
import ContributeForm from './ContributeForm';

export const dynamic = 'force-dynamic';

const LICENSE_LABEL: Record<string, string> = {
  'public-domain': '公有领域',
  'own-work': '本人创作',
  licensed: '已获授权',
  unknown: '来源待核',
};

const KIND_LABEL: Record<string, string> = {
  image: '图片',
  audio: '音频',
  book: '文本',
};

export default async function ContributePage() {
  let items: Awaited<ReturnType<typeof listApprovedContributions>> = [];
  let loadError = false;
  try {
    items = await listApprovedContributions(30);
  } catch {
    // 库未启动时仍展示投稿表单，避免整页变成错误页。
    loadError = true;
  }

  return (
    <div className="animate-fade-in max-w-2xl mx-auto space-y-10">
      <header>
        <h1 className="text-2xl font-serif tracking-wider">来稿</h1>
        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">
          欢迎供稿与道藏阅读相关的图片、录音或文本线索。来源说明必填；暂不接受视频。
          媒体文件直传对象存储，审核只看标题与来源文字，不扫描像素。
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-serif">投一篇</h2>
        <ContributeForm />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-serif">已公开</h2>
        {loadError && (
          <p className="text-sm text-[var(--muted)]">公开来稿暂时无法读取，数据库未连接。</p>
        )}
        {!loadError && items.length === 0 && (
          <p className="text-sm text-[var(--muted)]">尚无公开来稿。</p>
        )}
        <ul className="space-y-4">
          {items.map(item => {
            const src = item.storage_key ? mediaUrl(item.storage_key) : '';
            return (
              <li
                key={item.id}
                className="border border-[var(--border)] rounded-lg p-4 bg-[var(--card)] space-y-2"
              >
                <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                  <span>{KIND_LABEL[item.kind] ?? item.kind}</span>
                  <span>{LICENSE_LABEL[item.claimed_license] ?? item.claimed_license}</span>
                  <span>{item.author_name || '匿名道友'}</span>
                </div>
                <h3 className="font-serif">{item.title}</h3>
                {item.kind === 'image' && src && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={item.title} className="max-h-72 rounded" />
                )}
                {item.kind === 'audio' && src && (
                  <audio controls src={src} className="w-full" />
                )}
                {item.body && (
                  <p className="text-sm whitespace-pre-wrap text-[var(--muted)]">{item.body}</p>
                )}
                <p className="text-xs text-[var(--muted)]">来源：{item.source_note}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
