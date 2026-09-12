'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

type Kind = 'image' | 'audio' | 'book';
type License = 'public-domain' | 'own-work' | 'licensed' | 'unknown';

const ACCEPT: Record<Kind, string> = {
  image: 'image/jpeg,image/png,image/webp,image/gif',
  audio: 'audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/mp4',
  book: '',
};

export default function ContributeForm() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('image');
  const [title, setTitle] = useState('');
  const [sourceNote, setSourceNote] = useState('');
  const [body, setBody] = useState('');
  const [license, setLicense] = useState<License>('own-work');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [loading, setLoading] = useState(false);

  if (status === 'loading') {
    return <p className="text-sm text-[var(--muted)]">加载中…</p>;
  }

  if (!session?.user) {
    return (
      <p className="text-sm text-[var(--muted)]">
        登录后可投稿图片、音频或文本来源说明。
        {' '}
        <Link href="/login?callbackUrl=/contribute" className="text-[var(--accent)] hover:underline">
          去登录
        </Link>
      </p>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setHint('');
    setLoading(true);
    try {
      let storageKey = '';
      let contentType = '';
      if (kind === 'image' || kind === 'audio') {
        if (!file) throw new Error('请选择要上传的文件');
        const signed = await fetch('/api/contributions/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, contentType: file.type }),
        });
        const signedData = await signed.json();
        if (!signed.ok) throw new Error(signedData.error || '无法签发上传地址');
        if (file.size > signedData.maxBytes) {
          throw new Error(`文件过大（上限 ${Math.round(signedData.maxBytes / (1024 * 1024))} MB）`);
        }
        const put = await fetch(signedData.uploadUrl as string, {
          method: 'PUT',
          headers: signedData.headers as Record<string, string>,
          body: file,
        });
        if (!put.ok) throw new Error('文件上传失败，请确认对象存储已配置 CORS');
        storageKey = signedData.key;
        contentType = file.type;
      }

      const res = await fetch('/api/contributions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          title,
          sourceNote,
          body,
          claimedLicense: license,
          storageKey,
          contentType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '提交失败');

      const nextStatus = data.contribution?.status as string | undefined;
      if (nextStatus === 'approved') setHint('已公开。感谢供稿。');
      else if (nextStatus === 'pending') setHint('已提交，待审核通过后公开。');
      else setHint('未通过自动审核，已进入人工复核。');

      setTitle('');
      setSourceNote('');
      setBody('');
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setLoading(false);
    }
  };

  const field = 'w-full px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:border-[var(--accent)]';

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        {([
          ['image', '图片'],
          ['audio', '音频'],
          ['book', '文本/书目'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => { setKind(value); setFile(null); }}
            className={`px-3 py-1 rounded border ${
              kind === value
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--muted)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        required
        maxLength={80}
        placeholder="标题"
        value={title}
        onChange={e => setTitle(e.target.value)}
        className={field}
      />
      <textarea
        required
        maxLength={500}
        rows={3}
        placeholder="来源说明（必填：出处、拍摄/录制时间地点、授权情况）"
        value={sourceNote}
        onChange={e => setSourceNote(e.target.value)}
        className={field}
      />
      <textarea
        maxLength={2000}
        rows={4}
        placeholder="补充说明（可选）"
        value={body}
        onChange={e => setBody(e.target.value)}
        className={field}
      />
      <select
        value={license}
        onChange={e => setLicense(e.target.value as License)}
        className={field}
      >
        <option value="own-work">本人创作</option>
        <option value="public-domain">公有领域</option>
        <option value="licensed">已获授权</option>
        <option value="unknown">来源待核</option>
      </select>

      {kind !== 'book' && (
        <input
          type="file"
          accept={ACCEPT[kind]}
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-[var(--muted)]"
        />
      )}

      {error && <p className="text-xs text-[var(--cinnabar)]">{error}</p>}
      {hint && <p className="text-xs text-[var(--accent)]">{hint}</p>}

      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm hover:opacity-90 disabled:opacity-50"
      >
        {loading ? '提交中…' : '提交来稿'}
      </button>
    </form>
  );
}
