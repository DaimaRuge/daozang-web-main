'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  calibrationActionLabel,
  type CalibrationAiAction,
  type CalibrationVariant,
  type CalibrationVerdict,
} from '@/lib/restore-calibration';

export interface CalibrationMine {
  id: string;
  verdict: CalibrationVerdict;
  note: string;
  variant: CalibrationVariant;
  aiAction: CalibrationAiAction | null;
  aiSummary: string | null;
  updatedAt: number;
}

const VARIANT_LABEL: Record<CalibrationVariant, string> = {
  cinnabar: '朱砂复原',
  ink: '墨线复原',
  restored: '高清复原',
};

export default function CalibrateForm({
  bookId,
  part,
  file,
  variant,
  loginHref,
}: {
  bookId: string;
  part: string;
  file: string;
  variant: CalibrationVariant;
  loginHref: string;
}) {
  const { status } = useSession();
  const [verdict, setVerdict] = useState<CalibrationVerdict>('pass');
  const [note, setNote] = useState('');
  const [mine, setMine] = useState<CalibrationMine | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    const qs = new URLSearchParams({ bookId, file });
    fetch(`/api/restore-calibrations?${qs}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled || !data?.item) return;
        const item = data.item as CalibrationMine;
        setMine(item);
        setVerdict(item.verdict);
        setNote(item.note ?? '');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, bookId, file]);

  if (status !== 'authenticated') {
    return (
      <p className="text-sm text-[var(--muted)]">
        对照可直接看。提交校定需先
        <Link href={loginHref} className="text-[var(--accent)] hover:underline mx-1">
          登录
        </Link>
        ，以便后台按你的备注分类处理。
      </p>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setDone(false);
    try {
      const res = await fetch('/api/restore-calibrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, part, file, variant, verdict, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '提交失败');
        return;
      }
      setMine(data.item as CalibrationMine);
      setDone(true);
    } catch {
      setError('网络异常，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="text-sm mb-2">这张复原和原图是否对得上？</legend>
        <label
          className={`cursor-pointer rounded-lg border px-4 py-2 text-sm ${
            verdict === 'pass'
              ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
              : 'border-[var(--border)] hover:border-[var(--accent)]'
          }`}
        >
          <input
            type="radio"
            name="verdict"
            value="pass"
            className="sr-only"
            checked={verdict === 'pass'}
            onChange={() => setVerdict('pass')}
          />
          确认
        </label>
        <label
          className={`cursor-pointer rounded-lg border px-4 py-2 text-sm ${
            verdict === 'fail'
              ? 'border-[var(--cinnabar)] bg-[var(--cinnabar)] text-white'
              : 'border-[var(--border)] hover:border-[var(--cinnabar)]'
          }`}
        >
          <input
            type="radio"
            name="verdict"
            value="fail"
            className="sr-only"
            checked={verdict === 'fail'}
            onChange={() => setVerdict('fail')}
          />
          不通过
        </label>
      </fieldset>

      <label className="block text-sm">
        <span className="text-[var(--muted)]">备注（可选）</span>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          maxLength={500}
          rows={4}
          placeholder="例如：朱砂偏淡、纸色没抠干净、笔画对不上……"
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
        />
      </label>

      <p className="text-xs text-[var(--muted)]">
        当前对照：原扫描 · {VARIANT_LABEL[variant]}。提交后后台会阅读备注，分类为重染、重抠或核对结构；不会自动覆盖原图。
      </p>

      {error && <p className="text-sm text-[var(--cinnabar)]">{error}</p>}
      {done && mine && (
        <p className="text-sm text-[var(--accent)]">
          已记下。建议处理：{mine.aiAction ? calibrationActionLabel(mine.aiAction as CalibrationAiAction) : '待分类'}
          {mine.aiSummary ? ` · ${mine.aiSummary}` : ''}
        </p>
      )}
      {!done && mine && (
        <p className="text-xs text-[var(--muted)]">
          你此前评过「{mine.verdict === 'pass' ? '确认' : '不通过'}」，可修改后再次提交。
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="text-sm px-4 py-2 rounded-lg border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white disabled:opacity-50"
      >
        {busy ? '提交中…' : '提交校定'}
      </button>
    </form>
  );
}
